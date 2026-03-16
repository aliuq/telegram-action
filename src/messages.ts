import { existsSync, readFileSync } from "node:fs";
import telegramifyMarkdown from "telegramify-markdown";
import { isRemoteUrl, resolveWorkspacePath } from "./source-utils.js";

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

export interface StreamingFrameOptions {
  minFrames: number;
  maxFrames: number;
}

interface MessageSegment {
  type: "text" | "code";
  raw: string;
}

function getMessageUrlOverride(messageUrl: string): string | undefined {
  const rawOverrides = process.env.TELEGRAM_ACTION_TEST_MESSAGE_URL_OVERRIDES;
  if (!rawOverrides) {
    return undefined;
  }

  let overrides: unknown;
  try {
    overrides = JSON.parse(rawOverrides);
  } catch (error) {
    throw new Error(
      `TELEGRAM_ACTION_TEST_MESSAGE_URL_OVERRIDES must be valid JSON: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new Error("TELEGRAM_ACTION_TEST_MESSAGE_URL_OVERRIDES must be a JSON object keyed by URL");
  }

  const override = (overrides as Record<string, unknown>)[messageUrl];
  if (override === undefined) {
    return undefined;
  }

  if (typeof override !== "string") {
    throw new Error(`message_url override for "${messageUrl}" must be a string`);
  }

  return override;
}

/**
 * Convert plain user input into Telegram MarkdownV2 while keeping current behavior.
 */
export function formatTelegramMessage(message: string): string {
  return simplifySelfReferentialLinks(telegramifyMarkdown(stripLeadingFrontmatter(message), "keep"));
}

function stripLeadingFrontmatter(message: string): string {
  return message.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)+/, "");
}

function simplifySelfReferentialLinks(message: string): string {
  const markdownCodePattern = /(```[\s\S]*?```|`[^`\n]*`)/g;
  let result = "";
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

function replaceSelfReferentialLinks(message: string): string {
  const simplifiedLinks = message.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (fullMatch, label: string, target: string) => (label.replaceAll("\\", "") === target ? label : fullMatch),
  );

  return simplifiedLinks.replace(/(?<!\\)[<>]/g, "\\$&");
}

/**
 * Resolve message text from inline input, a local file, or a remote URL.
 */
export async function resolveMessageText(options: MessageSourceOptions): Promise<string | undefined> {
  if (options.message) {
    return options.message;
  }

  if (options.messageFile) {
    const resolvedPath = resolveWorkspacePath(options.messageFile);
    if (!existsSync(resolvedPath)) {
      throw new Error(`message_file path does not exist: ${options.messageFile}`);
    }

    return readFileSync(resolvedPath, "utf8");
  }

  if (options.messageUrl) {
    if (!isRemoteUrl(options.messageUrl)) {
      throw new Error("message_url must start with http:// or https://");
    }

    const override = getMessageUrlOverride(options.messageUrl);
    if (override !== undefined) {
      return override;
    }

    const response = await fetch(options.messageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`message_url request failed with status ${response.status}: ${options.messageUrl}`);
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
  for (const separator of ["\n\n", "\n", " "]) {
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
      chunks.push({ raw: remaining, formatted: formatTelegramMessage(remaining) });
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
        type: "text",
        raw: message.slice(lastIndex, matchIndex),
      });
    }

    segments.push({
      type: "code",
      raw: match[0],
    });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < message.length) {
    segments.push({
      type: "text",
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
  const firstNewlineIndex = rawBlock.indexOf("\n");
  const openingFence = firstNewlineIndex === -1 ? "```" : rawBlock.slice(0, firstNewlineIndex + 1);
  const closingFence = "\n```";
  const body =
    firstNewlineIndex === -1 ? "" : rawBlock.slice(firstNewlineIndex + 1, rawBlock.length - 3).replace(/\n$/, "");
  const fullFormatted = formatTelegramMessage(rawBlock);

  if (fullFormatted.length <= limit) {
    return [{ raw: rawBlock, formatted: fullFormatted }];
  }

  const staticOverhead = getFormattedLength(`${openingFence}${closingFence}`);
  const bodyBudget = Math.max(1, limit - staticOverhead);
  const lines = body.split("\n");
  const normalizedLines = lines.flatMap((line, lineIndex) => {
    const suffix = lineIndex === lines.length - 1 ? "" : "\n";
    return splitOversizedCodeLine(`${line}${suffix}`, bodyBudget);
  });

  const chunks: TelegramMessageChunk[] = [];
  let currentBody = "";

  for (const line of normalizedLines) {
    const candidateBody = currentBody + line;
    const candidateRaw = `${openingFence}${candidateBody}${candidateBody.endsWith("\n") ? "" : "\n"}\`\`\``;

    if (getFormattedLength(candidateRaw) <= limit) {
      currentBody = candidateBody;
      continue;
    }

    if (!currentBody) {
      throw new Error("failed to split fenced code block into Telegram-safe chunks");
    }

    const currentRaw = `${openingFence}${currentBody}${currentBody.endsWith("\n") ? "" : "\n"}\`\`\``;
    chunks.push({ raw: currentRaw, formatted: formatTelegramMessage(currentRaw) });
    currentBody = line;
  }

  if (currentBody) {
    const currentRaw = `${openingFence}${currentBody}${currentBody.endsWith("\n") ? "" : "\n"}\`\`\``;
    chunks.push({ raw: currentRaw, formatted: formatTelegramMessage(currentRaw) });
  }

  return chunks;
}

function mergeAdjacentChunks(chunks: TelegramMessageChunk[], limit: number): TelegramMessageChunk[] {
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
 * forms. The raw form is reused by draft streaming, while the formatted form is
 * what we actually persist with `sendMessage`.
 */
export function splitTelegramMessageChunks(message: string, limit: number): TelegramMessageChunk[] {
  if (!message) {
    return [];
  }

  const segments = parseMessageSegments(message);
  if (segments.some((segment) => segment.type === "code")) {
    const segmentChunks = segments.flatMap((segment) =>
      segment.type === "code"
        ? splitFencedCodeBlock(segment.raw, limit)
        : splitPlainTelegramMessageChunks(segment.raw, limit),
    );
    return mergeAdjacentChunks(segmentChunks, limit);
  }

  return splitPlainTelegramMessageChunks(message, limit);
}

function splitOversizedStreamingToken(token: string, maxTokenLength: number): string[] {
  if (token.length <= maxTokenLength || /\s/.test(token)) {
    return [token];
  }

  const chunks: string[] = [];
  for (let index = 0; index < token.length; index += maxTokenLength) {
    chunks.push(token.slice(index, index + maxTokenLength));
  }

  return chunks;
}

function getStreamingTokens(message: string, maxTokenLength: number): string[] {
  const rawTokens = message.match(/[^\s]+(?:[ \t]+)?|\n+/g) ?? [message];
  return rawTokens.flatMap((token) => splitOversizedStreamingToken(token, maxTokenLength));
}

/**
 * Break formatted text into smaller visible pieces for draft streaming. Natural
 * boundaries are preferred, but long uninterrupted text is still forced to move
 * forward so the stream never stalls.
 */
function buildStreamingPieces(message: string, targetCharactersPerPiece = 120): string[] {
  if (!message) {
    return [];
  }

  const maxTokenLength = Math.max(1, targetCharactersPerPiece);
  const tokens = getStreamingTokens(message, maxTokenLength);
  const pieces: string[] = [];
  let current = "";

  for (const token of tokens) {
    current += token;
    const minimumNaturalBoundaryLength = Math.max(1, Math.ceil(targetCharactersPerPiece * 0.85));
    const shouldEmit =
      current.trim().length > 0 &&
      (current.length >= targetCharactersPerPiece ||
        ((current.endsWith("\n\n") || current.endsWith("\n")) && current.length >= minimumNaturalBoundaryLength));

    if (!shouldEmit) {
      continue;
    }

    if (current) {
      pieces.push(current);
    }
    current = "";
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

function buildStreamingSegmentPieces(segment: MessageSegment, targetCharactersPerPiece: number): string[] {
  if (segment.type === "code") {
    // Code blocks are revealed atomically to avoid unclosed pre-entity parse errors.
    return [segment.raw];
  }

  return buildStreamingPieces(segment.raw, targetCharactersPerPiece);
}

/**
 * Build progressively longer formatted frames for project-local draft
 * streaming. Each next frame is simply "all previous raw text plus one more
 * piece", independently re-formatted into valid MarkdownV2. This avoids
 * invalid partial escape sequences that occur when slicing pre-formatted text.
 * Fenced code blocks are only introduced as complete units so every draft frame
 * remains valid Telegram MarkdownV2.
 */
export function buildStreamingFrames(message: string, options: StreamingFrameOptions): string[] {
  if (!message) {
    return [];
  }

  const formattedMessage = formatTelegramMessage(message);
  const desiredFrameCount = Math.max(
    options.minFrames,
    Math.min(options.maxFrames, Math.ceil(formattedMessage.length / 120)),
  );
  // Use raw message length for piece sizing since pieces are now raw text.
  const targetCharactersPerPiece = Math.max(1, Math.ceil(message.length / desiredFrameCount));
  const pieces = parseMessageSegments(message).flatMap((segment) =>
    buildStreamingSegmentPieces(segment, targetCharactersPerPiece),
  );
  const frames: string[] = [];
  let currentRaw = "";

  for (const piece of pieces) {
    currentRaw += piece;
    // Format each accumulated frame independently so every frame is
    // guaranteed to be valid MarkdownV2 on its own.
    const formatted = formatTelegramMessage(currentRaw);
    if (formatted !== frames.at(-1)) {
      frames.push(formatted);
    }
  }

  if (formattedMessage !== frames.at(-1)) {
    frames.push(formattedMessage);
  }

  return frames;
}
