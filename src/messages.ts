import { existsSync, readFileSync } from "node:fs";
import telegramifyMarkdown from "telegramify-markdown";
import { isRemoteUrl, resolveWorkspacePath } from "./source-utils.js";

export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const TELEGRAM_CAPTION_LIMIT = 1024;

export interface MessageSourceOptions {
  message: string;
  messageFile: string;
  messageUrl: string;
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
  return telegramifyMarkdown(message, "keep");
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

    const response = await fetch(options.messageUrl);
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

function findPreferredSplit(message: string, limit: number): number {
  const maxPrefix = findMaximumFittingPrefix(message, limit);
  const candidate = message.slice(0, maxPrefix);

  for (const separator of ["\n\n", "\n", " "]) {
    const separatorIndex = candidate.lastIndexOf(separator);
    if (separatorIndex > 0) {
      return separatorIndex + separator.length;
    }
  }

  return maxPrefix;
}

/**
 * Split text into Telegram-safe MarkdownV2 chunks while preferring natural boundaries.
 */
export function splitTelegramMessage(message: string, limit: number): string[] {
  if (!message) {
    return [];
  }

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (getFormattedLength(remaining) <= limit) {
      chunks.push(formatTelegramMessage(remaining));
      break;
    }

    const splitIndex = findPreferredSplit(remaining, limit);
    const chunk = remaining.slice(0, splitIndex);
    if (!chunk) {
      throw new Error(`failed to split message into Telegram-safe chunks (limit=${limit})`);
    }

    chunks.push(formatTelegramMessage(chunk));
    remaining = remaining.slice(splitIndex);
  }

  return chunks;
}
