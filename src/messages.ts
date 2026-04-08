import { existsSync, readFileSync } from 'node:fs';
import telegramifyMarkdown from 'telegramify-markdown';
import { assertPublicHttpUrl, isRemoteUrl, resolveExistingWorkspacePath } from './source-utils.js';

export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const TELEGRAM_MESSAGE_SOFT_LIMIT = 4000;
export const TELEGRAM_CAPTION_LIMIT = 1024;

export interface MessageSourceOptions {
  message: string;
  messageFile: string;
  messageUrl: string;
}

export interface TelegramMessageChunk {
  raw: string;
  formatted: string;
}

interface MessageSegment {
  type: 'text' | 'code';
  raw: string;
}

/**
 * Convert plain user input into Telegram MarkdownV2 while keeping current behavior.
 */
export function formatTelegramMessage(message: string): string {
  return simplifySelfReferentialLinks(
    telegramifyMarkdown(stripLeadingFrontmatter(message), 'keep'),
  );
}

function stripLeadingFrontmatter(message: string): string {
  return message.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)+/, '');
}

function simplifySelfReferentialLinks(message: string): string {
  const markdownCodePattern = /(```[\s\S]*?```|`[^`\n]*`)/g;
  let result = '';
  let lastIndex = 0;

  for (const match of message.matchAll(markdownCodePattern)) {
    const matchIndex = match.index ?? 0;
    result += replaceSelfReferentialLinks(message.slice(lastIndex, matchIndex));
    result += match[0];
    lastIndex = matchIndex + match[0].length;
  }

  result += replaceSelfReferentialLinks(message.slice(lastIndex));
  return result;
}

function simplifyMarkdownLinkLabel(label: string): string {
  const simplifiedLabel = label.replace(/(?<!\\)[*_~|]/g, '');
  return simplifiedLabel || label;
}

function replaceSelfReferentialLinks(message: string): string {
  const simplifiedLinks = message.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_fullMatch, label: string, target: string) => {
      const simplifiedLabel = simplifyMarkdownLinkLabel(label);
      return simplifiedLabel.replaceAll('\\', '') === target
        ? simplifiedLabel
        : `[${simplifiedLabel}](${target})`;
    },
  );

  return simplifiedLinks.replace(/(?<!\\)[<>]/g, '\\$&');
}

/**
 * Resolve message text from inline input, a local file, or a remote URL.
 */
export async function resolveMessageText(
  options: MessageSourceOptions,
): Promise<string | undefined> {
  if (options.message) {
    return options.message;
  }

  if (options.messageFile) {
    const resolvedPath = resolveExistingWorkspacePath(options.messageFile);
    if (!existsSync(resolvedPath)) {
      throw new Error(`message_file path does not exist: ${options.messageFile}`);
    }

    return readFileSync(resolvedPath, 'utf8');
  }

  if (options.messageUrl) {
    if (!isRemoteUrl(options.messageUrl)) {
      throw new Error('message_url must start with http:// or https://');
    }

    const messageUrl = await assertPublicHttpUrl(options.messageUrl);
    const response = await fetch(messageUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(
        `message_url request failed with status ${response.status}: ${options.messageUrl}`,
      );
    }

    return await response.text();
  }

  return undefined;
}

function getFormattedLength(message: string): number {
  return formatTelegramMessage(message).length;
}

/**
 * Find the largest raw-text prefix whose MarkdownV2-rendered form still fits
 * within Telegram's hard size limit.
 */
function findMaximumFittingPrefix(message: string, limit: number): number {
  if (message.length === 0) {
    return 0;
  }

  let low = 1;
  let high = message.length;
  let best = 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = message.slice(0, middle);
    if (getFormattedLength(candidate) <= limit) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best;
}

function findNaturalSplitIndex(candidate: string): number | undefined {
  for (const separator of ['\n\n', '\n', ' ']) {
    const separatorIndex = candidate.lastIndexOf(separator);
    if (separatorIndex > 0) {
      return separatorIndex + separator.length;
    }
  }

  return undefined;
}

/**
 * Prefer a natural boundary near the soft limit first, then fall back to the
 * hard limit if needed. This keeps long messages readable without risking a
 * Telegram rejection on the final payload.
 */
function findPreferredSplit(message: string, preferredLimit: number, hardLimit: number): number {
  const preferredPrefix = findMaximumFittingPrefix(message, preferredLimit);
  const preferredCandidate = message.slice(0, preferredPrefix);
  const preferredSplit = findNaturalSplitIndex(preferredCandidate);
  if (preferredSplit !== undefined) {
    return preferredSplit;
  }

  const hardPrefix = findMaximumFittingPrefix(message, hardLimit);
  const hardCandidate = message.slice(0, hardPrefix);
  const hardSplit = findNaturalSplitIndex(hardCandidate);
  if (hardSplit !== undefined) {
    return hardSplit;
  }

  return hardPrefix;
}

/**
 * Split text into Telegram-safe MarkdownV2 chunks while preferring natural boundaries.
 */
export function splitTelegramMessage(message: string, limit: number): string[] {
  return splitTelegramMessageChunks(message, limit).map((chunk) => chunk.formatted);
}

function splitPlainTelegramMessageChunks(message: string, limit: number): TelegramMessageChunk[] {
  if (!message) {
    return [];
  }

  const chunks: TelegramMessageChunk[] = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (getFormattedLength(remaining) <= limit) {
      chunks.push({
        raw: remaining,
        formatted: formatTelegramMessage(remaining),
      });
      break;
    }

    const preferredLimit = limit === TELEGRAM_MESSAGE_LIMIT ? TELEGRAM_MESSAGE_SOFT_LIMIT : limit;
    const splitIndex = findPreferredSplit(remaining, preferredLimit, limit);
    const chunk = remaining.slice(0, splitIndex);
    if (!chunk) {
      throw new Error(`failed to split message into Telegram-safe chunks (limit=${limit})`);
    }

    chunks.push({ raw: chunk, formatted: formatTelegramMessage(chunk) });
    remaining = remaining.slice(splitIndex);
  }

  return chunks;
}

function parseMessageSegments(message: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const fencedBlockPattern = /```[^\n]*\n[\s\S]*?```/g;
  let lastIndex = 0;

  for (const match of message.matchAll(fencedBlockPattern)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      segments.push({
        type: 'text',
        raw: message.slice(lastIndex, matchIndex),
      });
    }

    segments.push({
      type: 'code',
      raw: match[0],
    });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < message.length) {
    segments.push({
      type: 'text',
      raw: message.slice(lastIndex),
    });
  }

  return segments;
}

function splitOversizedCodeLine(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) {
    return [line];
  }

  const parts: string[] = [];
  for (let index = 0; index < line.length; index += maxLength) {
    parts.push(line.slice(index, index + maxLength));
  }

  return parts;
}

function splitFencedCodeBlock(rawBlock: string, limit: number): TelegramMessageChunk[] {
  const firstNewlineIndex = rawBlock.indexOf('\n');
  const openingFence = firstNewlineIndex === -1 ? '```' : rawBlock.slice(0, firstNewlineIndex + 1);
  const closingFence = '\n```';
  const body =
    firstNewlineIndex === -1
      ? ''
      : rawBlock.slice(firstNewlineIndex + 1, rawBlock.length - 3).replace(/\n$/, '');
  const fullFormatted = formatTelegramMessage(rawBlock);

  if (fullFormatted.length <= limit) {
    return [{ raw: rawBlock, formatted: fullFormatted }];
  }

  const staticOverhead = getFormattedLength(`${openingFence}${closingFence}`);
  const bodyBudget = Math.max(1, limit - staticOverhead);
  const lines = body.split('\n');
  const normalizedLines = lines.flatMap((line, lineIndex) => {
    const suffix = lineIndex === lines.length - 1 ? '' : '\n';
    return splitOversizedCodeLine(`${line}${suffix}`, bodyBudget);
  });

  const chunks: TelegramMessageChunk[] = [];
  let currentBody = '';

  for (const line of normalizedLines) {
    const candidateBody = currentBody + line;
    const candidateRaw = `${openingFence}${candidateBody}${candidateBody.endsWith('\n') ? '' : '\n'}\`\`\``;

    if (getFormattedLength(candidateRaw) <= limit) {
      currentBody = candidateBody;
      continue;
    }

    if (!currentBody) {
      throw new Error('failed to split fenced code block into Telegram-safe chunks');
    }

    const currentRaw = `${openingFence}${currentBody}${currentBody.endsWith('\n') ? '' : '\n'}\`\`\``;
    chunks.push({
      raw: currentRaw,
      formatted: formatTelegramMessage(currentRaw),
    });
    currentBody = line;
  }

  if (currentBody) {
    const currentRaw = `${openingFence}${currentBody}${currentBody.endsWith('\n') ? '' : '\n'}\`\`\``;
    chunks.push({
      raw: currentRaw,
      formatted: formatTelegramMessage(currentRaw),
    });
  }

  return chunks;
}

function mergeAdjacentChunks(
  chunks: TelegramMessageChunk[],
  limit: number,
): TelegramMessageChunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  const merged: TelegramMessageChunk[] = [];
  let current = chunks[0];

  for (const next of chunks.slice(1)) {
    const combinedRaw = current.raw + next.raw;
    if (getFormattedLength(combinedRaw) <= limit) {
      current = {
        raw: combinedRaw,
        formatted: formatTelegramMessage(combinedRaw),
      };
      continue;
    }

    merged.push(current);
    current = next;
  }

  merged.push(current);
  return merged;
}

/**
 * Split text into Telegram-safe chunks while preserving both raw and formatted
 * forms. The raw form is useful to callers that still need the original text,
 * while the formatted form is what we actually persist with `sendMessage`.
 */
export function splitTelegramMessageChunks(message: string, limit: number): TelegramMessageChunk[] {
  if (!message) {
    return [];
  }

  const segments = parseMessageSegments(message);
  if (segments.some((segment) => segment.type === 'code')) {
    const segmentChunks = segments.flatMap((segment) =>
      segment.type === 'code'
        ? splitFencedCodeBlock(segment.raw, limit)
        : splitPlainTelegramMessageChunks(segment.raw, limit),
    );
    return mergeAdjacentChunks(segmentChunks, limit);
  }

  return splitPlainTelegramMessageChunks(message, limit);
}
