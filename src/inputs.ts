import * as core from "@actions/core";
import type { InlineKeyboardButton } from "grammy/types";
import { resolveAttachmentSource } from "./attachments.js";
import { ATTACHMENT_TYPES, BUTTON_ACTION_FIELDS } from "./constants.js";
import { getOptionalEnv, getRequiredEnv } from "./env.js";
import { formatTelegramMessage, resolveMessageText, TELEGRAM_CAPTION_LIMIT } from "./messages.js";
import type {
  AttachmentType,
  InlineKeyboardMatrix,
  ParsedActionInputs,
  ParsedAttachmentItem,
  RawActionInputs,
  RawAttachmentItemInput,
} from "./types.js";

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
    messageFile: core.getInput("message_file", { required: false }),
    messageUrl: core.getInput("message_url", { required: false }),
    streamResponse: core.getInput("stream_response", { required: false }) || "false",
    buttons: core.getInput("buttons", { required: false }),
    topicId: getOptionalEnv("TELEGRAM_TOPIC_ID"),
    replyToMessageId: getOptionalEnv("TELEGRAM_REPLY_TO_MESSAGE_ID"),
    disableLinkPreview: core.getInput("disable_link_preview", { required: false }) || "true",
    attachment: core.getInput("attachment", { required: false }),
    attachments: core.getInput("attachments", { required: false }),
    attachmentType: core.getInput("attachment_type", { required: false }),
    attachmentFilename: core.getInput("attachment_filename", { required: false }),
    supportsStreaming: core.getInput("supports_streaming", { required: false }) || "false",
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

function assertRawAttachmentItem(input: unknown): asserts input is RawAttachmentItemInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`each attachments item must be a plain object, got: ${JSON.stringify(input)}`);
  }

  const item = input as Record<string, unknown>;
  if (typeof item.type !== "string" || !isAttachmentType(item.type)) {
    throw new Error(`attachments item must include a valid "type": ${JSON.stringify(input)}`);
  }

  if (typeof item.source !== "string" || !item.source) {
    throw new Error(`attachments item must include a non-empty "source": ${JSON.stringify(input)}`);
  }

  if ("filename" in item && typeof item.filename !== "string") {
    throw new Error(`attachments item "filename" must be a string: ${JSON.stringify(input)}`);
  }

  if ("caption" in item && typeof item.caption !== "string") {
    throw new Error(`attachments item "caption" must be a string: ${JSON.stringify(input)}`);
  }

  if ("supports_streaming" in item && typeof item.supports_streaming !== "boolean") {
    throw new Error(`attachments item "supports_streaming" must be a boolean: ${JSON.stringify(input)}`);
  }

  if (item.supports_streaming === true && item.type !== "video") {
    throw new Error(
      `attachments item "supports_streaming" can only be used with type "video": ${JSON.stringify(input)}`,
    );
  }
}

function parseAttachments(input: string): ParsedAttachmentItem[] {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (error) {
    throw new Error(`attachments must be valid JSON: ${error instanceof Error ? error.message : error}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("attachments must be a non-empty JSON array");
  }

  return data.map((item) => {
    assertRawAttachmentItem(item);
    const source = resolveAttachmentSource(item.source, item.filename);

    if (item.filename && !source.isLocalFile) {
      throw new Error("attachments item filename can only be used with a local attachment path");
    }

    const caption = item.caption ? formatTelegramMessage(item.caption) : undefined;
    if (caption && caption.length > TELEGRAM_CAPTION_LIMIT) {
      throw new Error(
        `attachments item caption exceeds Telegram limit (${TELEGRAM_CAPTION_LIMIT} characters after formatting)`,
      );
    }

    return {
      type: item.type,
      source,
      filename: item.filename,
      caption,
      supportsStreaming: item.supports_streaming,
    };
  });
}

/**
 * Validate relationships between related inputs before building the final request.
 */
function assertInputConsistency(rawInputs: RawActionInputs, attachmentType?: AttachmentType): void {
  const messageSourceCount = [rawInputs.message, rawInputs.messageFile, rawInputs.messageUrl].filter(Boolean).length;
  const hasAttachment = Boolean(rawInputs.attachment);
  const hasAttachments = Boolean(rawInputs.attachments);

  if (messageSourceCount > 1) {
    throw new Error('only one of "message", "message_file", or "message_url" may be provided');
  }

  if (hasAttachment && hasAttachments) {
    throw new Error('"attachment" and "attachments" cannot be used together');
  }

  if (hasAttachments && (rawInputs.attachmentType || rawInputs.attachmentFilename)) {
    throw new Error('"attachment_type" and "attachment_filename" cannot be used with "attachments"');
  }

  if (messageSourceCount === 0 && !hasAttachment && !hasAttachments) {
    throw new Error('either a message source, "attachment", or "attachments" must be provided');
  }

  if (rawInputs.streamResponse === "true" && messageSourceCount === 0) {
    throw new Error('"stream_response" requires "message", "message_file", or "message_url"');
  }

  if (rawInputs.streamResponse === "true" && (hasAttachment || hasAttachments)) {
    throw new Error('"stream_response" currently supports text-only messages and cannot be combined with attachments');
  }

  if (hasAttachment && !attachmentType) {
    throw new Error('attachment_type is required when "attachment" is provided');
  }

  if (!hasAttachment && attachmentType) {
    throw new Error('"attachment" is required when attachment_type is provided');
  }

  if (rawInputs.supportsStreaming === "true" && !hasAttachment) {
    throw new Error('"supports_streaming" requires a single "attachment" with attachment_type "video"');
  }

  if (rawInputs.supportsStreaming === "true" && rawInputs.attachmentType !== "video") {
    throw new Error('"supports_streaming" can only be used with attachment_type "video"');
  }

  if (rawInputs.supportsStreaming === "true" && hasAttachments) {
    throw new Error(
      '"supports_streaming" cannot be used with "attachments"; set "supports_streaming" per item instead',
    );
  }

  if (hasAttachments && rawInputs.buttons && messageSourceCount === 0) {
    throw new Error(
      '"buttons" with "attachments" requires a message source so the keyboard can be attached to a text message',
    );
  }
}

/**
 * Parse and validate raw action inputs into a normalized request object.
 */
export async function parseActionInputs(rawInputs: RawActionInputs): Promise<ParsedActionInputs> {
  const attachmentType = parseOptionalAttachmentType(rawInputs.attachmentType);
  assertInputConsistency(rawInputs, attachmentType);

  const attachmentSource = rawInputs.attachment
    ? resolveAttachmentSource(rawInputs.attachment, rawInputs.attachmentFilename || undefined)
    : undefined;
  const attachmentItems = rawInputs.attachments ? parseAttachments(rawInputs.attachments) : undefined;

  if (rawInputs.attachmentFilename && attachmentSource && !attachmentSource.isLocalFile) {
    throw new Error("attachment_filename can only be used with a local attachment path");
  }

  const replyMarkup = rawInputs.buttons ? { inline_keyboard: parseButtons(rawInputs.buttons) } : undefined;
  const message = await resolveMessageText({
    message: rawInputs.message,
    messageFile: rawInputs.messageFile,
    messageUrl: rawInputs.messageUrl,
  });

  return {
    scenarioId: rawInputs.scenarioId,
    botToken: rawInputs.botToken,
    chatId: rawInputs.chatId,
    message,
    streamResponse: parseBooleanInput("stream_response", rawInputs.streamResponse),
    disableLinkPreview: parseBooleanInput("disable_link_preview", rawInputs.disableLinkPreview),
    topicId: parseOptionalIntegerInput("topic_id", rawInputs.topicId),
    replyMessageId: parseOptionalIntegerInput("reply_to_message_id", rawInputs.replyToMessageId),
    replyMarkup,
    attachmentType,
    attachmentSource,
    attachmentItems,
    supportsStreaming: parseBooleanInput("supports_streaming", rawInputs.supportsStreaming),
  };
}
