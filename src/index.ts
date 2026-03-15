import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import * as core from "@actions/core";
import { InputFile } from "grammy";
import type { InlineKeyboardButton, InlineKeyboardMarkup } from "grammy/types";
import { Bot } from "grammy/web";
import telegramifyMarkdown from "telegramify-markdown";

// All valid action fields for an InlineKeyboardButton per the Telegram Bot API.
// Each button must have "text" plus exactly one of these fields.
const BUTTON_ACTION_FIELDS = [
  "url",
  "callback_data",
  "web_app",
  "login_url",
  "switch_inline_query",
  "switch_inline_query_current_chat",
  "switch_inline_query_chosen_chat",
  "copy_text",
  "callback_game",
  "pay",
] as const;

const ATTACHMENT_TYPES = ["photo", "video", "audio", "animation", "document"] as const;

type AttachmentType = (typeof ATTACHMENT_TYPES)[number];
type InlineKeyboardMatrix = InlineKeyboardMarkup["inline_keyboard"];

interface ResolvedAttachmentSource {
  value: InputFile | string;
  isLocalFile: boolean;
}

/**
 * Detect whether the action is currently running inside a local act session.
 */
function isActRun(): boolean {
  return process.env.ACT === "true" || Boolean(process.env.ACT_SCENARIO_ID);
}

/**
 * Hide most of an identifier while still leaving enough detail for debugging.
 */
function maskIdentifier(value: string): string {
  if (value.length <= 4) {
    return value;
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

/**
 * Describe the attachment source without logging the full value.
 */
function describeAttachmentSource(source: ResolvedAttachmentSource): string {
  if (source.isLocalFile) {
    return "local-file";
  }

  if (typeof source.value === "string" && /^https?:\/\//.test(source.value)) {
    return "remote-url";
  }

  return "telegram-file-id";
}

/**
 * Print extra diagnostics that are only useful during local act-based runs.
 */
function logActRequestSummary(options: {
  scenarioId?: string;
  method: string;
  chatId: string;
  message?: string;
  disableLinkPreview: boolean;
  replyMessageId?: number;
  replyMarkup?: InlineKeyboardMarkup;
  attachmentType?: AttachmentType;
  attachmentSource?: ResolvedAttachmentSource;
}): void {
  if (!isActRun()) {
    return;
  }

  const buttonRows = options.replyMarkup?.inline_keyboard.length ?? 0;
  const buttonCount = options.replyMarkup?.inline_keyboard.flat().length ?? 0;

  core.startGroup(`[act] Telegram request debug${options.scenarioId ? ` (${options.scenarioId})` : ""}`);
  core.info(`method=${options.method}`);
  core.info(`chat_id=${maskIdentifier(options.chatId)}`);
  core.info(`message_length=${options.message?.length ?? 0}`);
  core.info(`disable_link_preview=${String(options.disableLinkPreview)}`);
  core.info(`reply_to_message_id=${options.replyMessageId ?? "none"}`);
  core.info(`button_rows=${buttonRows}`);
  core.info(`button_count=${buttonCount}`);
  core.info(`attachment_type=${options.attachmentType ?? "none"}`);
  core.info(
    `attachment_source=${options.attachmentSource ? describeAttachmentSource(options.attachmentSource) : "none"}`,
  );
  core.info(`cwd=${process.cwd()}`);
  core.endGroup();
}

/**
 * Print nested error details when the local act run fails before Telegram returns
 * a normal API response.
 */
function logActErrorDetails(error: unknown): void {
  if (!isActRun()) {
    return;
  }

  const details: string[] = [];

  if (error instanceof Error) {
    details.push(`${error.name}: ${error.message}`);
    if (error.stack) {
      details.push(error.stack);
    }
    const nestedError = Reflect.get(error, "error");
    if (nestedError instanceof Error) {
      details.push(`cause=${nestedError.name}: ${nestedError.message}`);
      if (nestedError.stack) {
        details.push(nestedError.stack);
      }
    }
    const directCause = Reflect.get(error, "cause");
    if (directCause instanceof Error) {
      details.push(`cause=${directCause.name}: ${directCause.message}`);
      if (directCause.stack) {
        details.push(directCause.stack);
      }
    }
  } else {
    details.push(String(error));
  }

  core.startGroup("[act] Telegram request failure details");
  for (const detail of details) {
    core.error(detail);
  }
  core.endGroup();
}

/**
 * Validate that an unknown JSON value matches the Telegram inline button shape.
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

/**
 * Parse and normalize the `buttons` input into an InlineKeyboard row matrix.
 *
 * Supports two formats:
 *  - Nested (multi-row): `[[{text, url}, ...], [{text, url}]]`
 *  - Flat   (single-row): `[{text, url}, {text, url}]`  ← automatically wrapped
 *
 * Throws a descriptive error when the structure is invalid.
 */
function parseButton(input: unknown): InlineKeyboardButton {
  assertInlineKeyboardButton(input);
  return input;
}

/**
 * Parse and normalize the `buttons` input into a Telegram inline keyboard.
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

  // Detect flat `[{...}]` vs nested `[[{...}]]` input and normalize to rows.
  const rows: unknown[][] = Array.isArray(data[0]) ? (data as unknown[][]) : [data];

  return rows.map((row) => {
    if (!Array.isArray(row)) {
      throw new Error("each row in buttons must be an array of button objects");
    }
    return row.map((button) => parseButton(button));
  });
}

/**
 * Parse a GitHub Actions boolean-like string input.
 * Only "true" and "false" are accepted to avoid ambiguous behavior.
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
 * Parse an optional attachment type, validating it against the supported set.
 */
function parseOptionalAttachmentType(value: string): AttachmentType | undefined {
  if (!value) {
    return undefined;
  }

  if (ATTACHMENT_TYPES.includes(value as AttachmentType)) {
    return value as AttachmentType;
  }

  throw new Error(`attachment_type must be one of: ${ATTACHMENT_TYPES.join(", ")}`);
}

/**
 * Resolve a local file path to an InputFile. URLs and Telegram file_ids are
 * passed through as strings so Telegram can fetch or reuse them directly.
 */
function resolveAttachmentSource(input: string, filename?: string): ResolvedAttachmentSource {
  const resolvedPath = resolve(process.cwd(), input);
  if (existsSync(resolvedPath)) {
    return {
      value: new InputFile(resolvedPath, filename || basename(resolvedPath)),
      isLocalFile: true,
    };
  }

  if (input.startsWith("./") || input.startsWith("../") || input.startsWith("/")) {
    throw new Error(`attachment path does not exist: ${input}`);
  }

  return {
    value: input,
    isLocalFile: false,
  };
}

/**
 * Convert the plain message input into a Telegram MarkdownV2-compatible body.
 */
function formatMessage(message: string): string | undefined {
  if (!message) {
    return undefined;
  }

  return telegramifyMarkdown(message, "keep");
}

async function run() {
  try {
    const scenarioId = process.env.ACT_SCENARIO_ID;
    const botToken = core.getInput("bot_token", { required: true });
    const chatId = core.getInput("chat_id", { required: true });
    const message = core.getInput("message", { required: false });
    const buttons = core.getInput("buttons", { required: false });
    const replyToMessageId = core.getInput("reply_to_message_id", { required: false });
    const disableLinkPreview = core.getInput("disable_link_preview", { required: false }) || "true";
    const attachment = core.getInput("attachment", { required: false });
    const attachmentTypeInput = core.getInput("attachment_type", { required: false });
    const attachmentFilename = core.getInput("attachment_filename", { required: false });
    // const apiRoot = process.env.TELEGRAM_API_ROOT?.trim() || undefined;

    const attachmentType = parseOptionalAttachmentType(attachmentTypeInput);
    if (!message && !attachment) {
      throw new Error('either "message" or "attachment" must be provided');
    }
    if (attachment && !attachmentType) {
      throw new Error('attachment_type is required when "attachment" is provided');
    }
    if (!attachment && attachmentType) {
      throw new Error('"attachment" is required when attachment_type is provided');
    }

    const formattedMessage = formatMessage(message);
    const bot = new Bot(botToken, {
      // client: {
      //   ...(apiRoot ? { apiRoot } : {}),
      //   baseFetchConfig: {},
      //   fetch: createCompatibleFetch(),
      // },
    });
    // const me = await bot.api.getMe();
    // core.info(`Bot username: @${me.username}`);

    // const botInfo = await bot.api.getMe();

    const replyMarkup: InlineKeyboardMarkup | undefined = buttons
      ? { inline_keyboard: parseButtons(buttons) }
      : undefined;
    const disableLinkPreviewValue = parseBooleanInput("disable_link_preview", disableLinkPreview);

    const replyMessageId = parseOptionalIntegerInput("reply_to_message_id", replyToMessageId);
    const replyParameters = replyMessageId !== undefined ? { message_id: replyMessageId } : undefined;

    let result: { message_id: number };

    if (attachment && attachmentType) {
      const resolvedAttachment = resolveAttachmentSource(attachment, attachmentFilename || undefined);
      if (attachmentFilename && !resolvedAttachment.isLocalFile) {
        throw new Error("attachment_filename can only be used with a local attachment path");
      }

      const sendMethod =
        attachmentType === "photo"
          ? "sendPhoto"
          : attachmentType === "video"
            ? "sendVideo"
            : attachmentType === "audio"
              ? "sendAudio"
              : attachmentType === "animation"
                ? "sendAnimation"
                : "sendDocument";
      logActRequestSummary({
        scenarioId,
        method: sendMethod,
        chatId,
        message: formattedMessage,
        disableLinkPreview: disableLinkPreviewValue,
        replyMessageId,
        replyMarkup,
        attachmentType,
        attachmentSource: resolvedAttachment,
      });

      const attachmentOptions = {
        ...(formattedMessage ? { caption: formattedMessage, parse_mode: "MarkdownV2" as const } : {}),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        ...(replyParameters ? { reply_parameters: replyParameters } : {}),
      };

      switch (attachmentType) {
        case "photo":
          result = await bot.api.sendPhoto(chatId, resolvedAttachment.value, attachmentOptions);
          break;
        case "video":
          result = await bot.api.sendVideo(chatId, resolvedAttachment.value, attachmentOptions);
          break;
        case "audio":
          result = await bot.api.sendAudio(chatId, resolvedAttachment.value, attachmentOptions);
          break;
        case "animation":
          result = await bot.api.sendAnimation(chatId, resolvedAttachment.value, attachmentOptions);
          break;
        case "document":
          result = await bot.api.sendDocument(chatId, resolvedAttachment.value, attachmentOptions);
          break;
      }
    } else {
      logActRequestSummary({
        scenarioId,
        method: "sendMessage",
        chatId,
        message: formattedMessage,
        disableLinkPreview: disableLinkPreviewValue,
        replyMessageId,
        replyMarkup,
      });

      const messageOptions = {
        parse_mode: "MarkdownV2" as const,
        link_preview_options: {
          is_disabled: disableLinkPreviewValue,
        },
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        ...(replyParameters ? { reply_parameters: replyParameters } : {}),
      };

      result = await bot.api.sendMessage(chatId, formattedMessage ?? "", messageOptions);
    }

    core.setOutput("message_id", result.message_id.toString());
    core.setOutput("status", "success");
    if (isActRun()) {
      core.info(`[act] Sent Telegram message successfully (message_id=${result.message_id})`);
    }
  } catch (error) {
    console.error("Error sending Telegram message:", error);

    logActErrorDetails(error);
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
}

run();
