import { InputMediaBuilder } from "grammy";
import type { AttachmentSender, AttachmentType, TelegramMediaGroupItem } from "./types.js";

/**
 * Telegram inline keyboard fields that count as button actions.
 */
export const BUTTON_ACTION_FIELDS = [
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

/**
 * Attachment kinds supported by this action.
 */
export const ATTACHMENT_TYPES = ["photo", "video", "audio", "animation", "document"] as const;

/** Mapping from attachment kinds to Telegram Bot API method names. */
export const ATTACHMENT_METHOD_NAMES: Record<AttachmentType, string> = {
  photo: "sendPhoto",
  video: "sendVideo",
  audio: "sendAudio",
  animation: "sendAnimation",
  document: "sendDocument",
};

/** Concrete sender implementations for each supported attachment kind. */
export const ATTACHMENT_SENDERS: Record<AttachmentType, AttachmentSender> = {
  photo: (bot, chatId, source, options) => bot.api.sendPhoto(chatId, source, options),
  video: (bot, chatId, source, options) => bot.api.sendVideo(chatId, source, options),
  audio: (bot, chatId, source, options) => bot.api.sendAudio(chatId, source, options),
  animation: (bot, chatId, source, options) => bot.api.sendAnimation(chatId, source, options),
  document: (bot, chatId, source, options) => bot.api.sendDocument(chatId, source, options),
};

/**
 * Media types that Telegram supports inside `sendMediaGroup`.
 */
export const MEDIA_GROUP_ATTACHMENT_TYPES = ["photo", "video", "audio", "document"] as const;

/**
 * Maximum items allowed by Telegram in a single media group request.
 */
export const TELEGRAM_MEDIA_GROUP_LIMIT = 10;

/**
 * Build typed media-group entries for the supported Telegram album payloads.
 */
export const MEDIA_GROUP_BUILDERS: Record<
  (typeof MEDIA_GROUP_ATTACHMENT_TYPES)[number],
  (
    source: string | import("grammy").InputFile,
    options?: {
      caption?: string;
      parse_mode?: "MarkdownV2";
      disable_content_type_detection?: boolean;
      supports_streaming?: boolean;
    },
  ) => TelegramMediaGroupItem
> = {
  photo: (source, options) => InputMediaBuilder.photo(source, options),
  video: (source, options) => InputMediaBuilder.video(source, options),
  audio: (source, options) => InputMediaBuilder.audio(source, options),
  document: (source, options) => InputMediaBuilder.document(source, options),
};

// ── Streaming tuning constants ──────────────────────────────────────────────

/** Number of draft frames for a single-chunk streaming response. */
export const STREAMING_SINGLE_CHUNK_FRAMES = 15;

/** Number of draft frames per chunk in multi-chunk streaming responses. */
export const STREAMING_MULTI_CHUNK_FRAMES = 8;

/** Maximum total draft frames across all chunks in multi-chunk responses. */
export const STREAMING_MULTI_CHUNK_TOTAL_FRAME_BUDGET = 20;

/** Base inter-frame delay in milliseconds for streaming animation. */
export const STREAMING_FRAME_DELAY_MS = 150;

/** Minimum inter-frame delay in milliseconds. */
export const STREAMING_FRAME_DELAY_MIN_MS = 100;

/** Maximum inter-frame delay in milliseconds. */
export const STREAMING_FRAME_DELAY_MAX_MS = 400;

/** How often to refresh the typing indicator during streaming (ms). */
export const TYPING_REFRESH_INTERVAL_MS = 4000;

/** Maximum number of rate-limit retries for a single draft frame. */
export const MAX_DRAFT_RETRIES = 5;
