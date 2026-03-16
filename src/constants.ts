import type { AttachmentSender, AttachmentType } from "./types.js";

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
