import * as core from "@actions/core";
import type { InlineKeyboardButton } from "grammy/types";
import telegramifyMarkdown from "telegramify-markdown";
import { resolveAttachmentSource } from "./attachments.js";
import { ATTACHMENT_TYPES, BUTTON_ACTION_FIELDS } from "./constants.js";
import { getOptionalEnv, getRequiredEnv } from "./env.js";
import type { AttachmentType, InlineKeyboardMatrix, ParsedActionInputs, RawActionInputs } from "./types.js";

/**
 * Read the raw GitHub Actions inputs without applying validation yet.
 *
 * Keeping the IO boundary separate makes the parser reusable from local scripts,
 * which helps the validation flow and the published action stay aligned.
 */
export function readRawActionInputs(): RawActionInputs {
  return {
    scenarioId: process.env.ACT_SCENARIO_ID,
    botToken: getRequiredEnv("TELEGRAM_BOT_TOKEN"),
    chatId: getRequiredEnv("TELEGRAM_CHAT_ID"),
    message: core.getInput("message", { required: false }),
    buttons: core.getInput("buttons", { required: false }),
    replyToMessageId: getOptionalEnv("TELEGRAM_REPLY_TO_MESSAGE_ID"),
    disableLinkPreview: core.getInput("disable_link_preview", { required: false }) || "true",
    attachment: core.getInput("attachment", { required: false }),
    attachmentType: core.getInput("attachment_type", { required: false }),
    attachmentFilename: core.getInput("attachment_filename", { required: false }),
  };
}

/**
 * Validate that an unknown JSON value matches Telegram's inline button shape.
 */
function assertInlineKeyboardButton(input: unknown): asserts input is InlineKeyboardButton {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`each button must be a plain object, got: ${JSON.stringify(input)}`);
  }

  const button = input as Record<string, unknown>;
  if (typeof button.text !== "string" || !button.text) {
    throw new Error(`button is missing required "text" field: ${JSON.stringify(input)}`);
  }

  const actionFields = BUTTON_ACTION_FIELDS.filter((field) => field in button);
  if (actionFields.length === 0) {
    throw new Error(
      `button "${button.text}" needs an action field such as "url" or "callback_data": ${JSON.stringify(input)}`,
    );
  }

  if (actionFields.length > 1) {
    throw new Error(`button "${button.text}" must define exactly one action field, got: ${actionFields.join(", ")}`);
  }
}

function parseButton(input: unknown): InlineKeyboardButton {
  assertInlineKeyboardButton(input);
  return input;
}

/**
 * Parse and normalize the `buttons` input into Telegram's row-based matrix.
 *
 * Supported formats:
 * - `[{...}, {...}]` for a single row
 * - `[[{...}], [{...}]]` for multiple rows
 */
function parseButtons(input: string): InlineKeyboardMatrix {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (error) {
    throw new Error(`buttons must be valid JSON: ${error instanceof Error ? error.message : error}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("buttons must be a non-empty JSON array");
  }

  const rows: unknown[][] = Array.isArray(data[0]) ? (data as unknown[][]) : [data];

  return rows.map((row) => {
    if (!Array.isArray(row)) {
      throw new Error("each row in buttons must be an array of button objects");
    }

    return row.map((button) => parseButton(button));
  });
}

function isAttachmentType(value: string): value is AttachmentType {
  return ATTACHMENT_TYPES.some((attachmentType) => attachmentType === value);
}

/**
 * Accept only explicit string booleans to avoid YAML truthiness surprises.
 */
function parseBooleanInput(name: string, value: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be either "true" or "false", received "${value}"`);
}

/**
 * Parse an optional integer input. Empty strings are treated as omitted values.
 */
function parseOptionalIntegerInput(name: string, value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`${name} must be a valid integer, received "${value}"`);
  }

  return parsedValue;
}

/**
 * Parse an optional attachment type and validate it against the supported set.
 */
function parseOptionalAttachmentType(value: string): AttachmentType | undefined {
  if (!value) {
    return undefined;
  }

  if (isAttachmentType(value)) {
    return value;
  }

  throw new Error(`attachment_type must be one of: ${ATTACHMENT_TYPES.join(", ")}`);
}

/**
 * Convert the plain message input into Telegram MarkdownV2 while preserving the
 * existing user-facing Markdown behavior.
 */
function formatMessage(message: string): string | undefined {
  if (!message) {
    return undefined;
  }

  return telegramifyMarkdown(message, "keep");
}

/**
 * Validate relationships between related inputs before building the final request.
 */
function assertInputConsistency(rawInputs: RawActionInputs, attachmentType?: AttachmentType): void {
  if (!rawInputs.message && !rawInputs.attachment) {
    throw new Error('either "message" or "attachment" must be provided');
  }

  if (rawInputs.attachment && !attachmentType) {
    throw new Error('attachment_type is required when "attachment" is provided');
  }

  if (!rawInputs.attachment && attachmentType) {
    throw new Error('"attachment" is required when attachment_type is provided');
  }
}

/**
 * Parse and validate raw action inputs into a normalized request object.
 */
export function parseActionInputs(rawInputs: RawActionInputs): ParsedActionInputs {
  const attachmentType = parseOptionalAttachmentType(rawInputs.attachmentType);
  assertInputConsistency(rawInputs, attachmentType);

  const attachmentSource = rawInputs.attachment
    ? resolveAttachmentSource(rawInputs.attachment, rawInputs.attachmentFilename || undefined)
    : undefined;

  if (rawInputs.attachmentFilename && attachmentSource && !attachmentSource.isLocalFile) {
    throw new Error("attachment_filename can only be used with a local attachment path");
  }

  const replyMarkup = rawInputs.buttons ? { inline_keyboard: parseButtons(rawInputs.buttons) } : undefined;

  return {
    scenarioId: rawInputs.scenarioId,
    botToken: rawInputs.botToken,
    chatId: rawInputs.chatId,
    message: formatMessage(rawInputs.message),
    disableLinkPreview: parseBooleanInput("disable_link_preview", rawInputs.disableLinkPreview),
    replyMessageId: parseOptionalIntegerInput("reply_to_message_id", rawInputs.replyToMessageId),
    replyMarkup,
    attachmentType,
    attachmentSource,
  };
}
