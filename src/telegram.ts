import { Bot } from "grammy";
import { logActRequestSummary } from "./act-logging.js";
import { ATTACHMENT_METHOD_NAMES, ATTACHMENT_SENDERS } from "./constants.js";
import type { ParsedActionInputs } from "./types.js";

/**
 * Build Telegram reply parameters only when a reply target id was provided.
 */
function createReplyParameters(replyMessageId?: number) {
  return replyMessageId !== undefined ? { message_id: replyMessageId } : undefined;
}

/**
 * Build the shared attachment options in one place.
 *
 * Keeping this separate avoids repeating the caption, parse mode, reply markup,
 * and reply parameters logic across every attachment sender.
 */
function createAttachmentOptions(request: ParsedActionInputs) {
  const replyParameters = createReplyParameters(request.replyMessageId);

  return {
    ...(request.message ? { caption: request.message, parse_mode: "MarkdownV2" as const } : {}),
    ...(request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
    ...(request.attachmentType === "document" ? { disable_content_type_detection: true } : {}),
  };
}

/**
 * Build `sendMessage` options separately because link preview settings only
 * apply to plain text messages.
 */
function createMessageOptions(request: ParsedActionInputs) {
  const replyParameters = createReplyParameters(request.replyMessageId);

  return {
    parse_mode: "MarkdownV2" as const,
    link_preview_options: {
      is_disabled: request.disableLinkPreview,
    },
    ...(request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
  };
}

/**
 * Send the normalized Telegram request.
 *
 * The entry point stays tiny while transport details live here, which makes new
 * behaviors easier to add without reopening the parsing layer.
 */
export async function sendTelegramMessage(request: ParsedActionInputs): Promise<{ message_id: number }> {
  const bot = new Bot(request.botToken);

  if (request.attachmentSource && request.attachmentType) {
    logActRequestSummary({
      scenarioId: request.scenarioId,
      method: ATTACHMENT_METHOD_NAMES[request.attachmentType],
      chatId: request.chatId,
      message: request.message,
      disableLinkPreview: request.disableLinkPreview,
      replyMessageId: request.replyMessageId,
      replyMarkup: request.replyMarkup,
      attachmentType: request.attachmentType,
      attachmentSource: request.attachmentSource,
    });

    return ATTACHMENT_SENDERS[request.attachmentType](
      bot,
      request.chatId,
      request.attachmentSource.value,
      createAttachmentOptions(request),
    );
  }

  logActRequestSummary({
    scenarioId: request.scenarioId,
    method: "sendMessage",
    chatId: request.chatId,
    message: request.message,
    disableLinkPreview: request.disableLinkPreview,
    replyMessageId: request.replyMessageId,
    replyMarkup: request.replyMarkup,
  });

  return bot.api.sendMessage(request.chatId, request.message ?? "", createMessageOptions(request));
}
