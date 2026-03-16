import { Bot } from "grammy";
import { logActRequestSummary } from "./act-logging.js";
import {
  ATTACHMENT_METHOD_NAMES,
  ATTACHMENT_SENDERS,
  MEDIA_GROUP_BUILDERS,
  TELEGRAM_MEDIA_GROUP_LIMIT,
} from "./constants.js";
import {
  formatTelegramMessage,
  splitTelegramMessage,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_MESSAGE_LIMIT,
} from "./messages.js";
import type { AttachmentType, ParsedActionInputs, ParsedAttachmentItem } from "./types.js";

/**
 * Build Telegram reply parameters only when a reply target id was provided.
 */
function createReplyParameters(replyMessageId?: number) {
  return replyMessageId !== undefined ? { message_id: replyMessageId } : undefined;
}

/**
 * Build the shared attachment options in one place.
 */
function createAttachmentOptions(
  request: ParsedActionInputs,
  attachmentType: AttachmentType,
  replyMessageId?: number,
  caption?: string,
  includeReplyMarkup = true,
) {
  const replyParameters = createReplyParameters(replyMessageId);

  return {
    ...(caption ? { caption, parse_mode: "MarkdownV2" as const } : {}),
    ...(includeReplyMarkup && request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
    ...(attachmentType === "document" ? { disable_content_type_detection: true } : {}),
  };
}

/**
 * Build `sendMessage` options separately because link preview settings only apply
 * to plain text messages.
 */
function createMessageOptions(request: ParsedActionInputs, replyMessageId?: number, includeReplyMarkup = true) {
  const replyParameters = createReplyParameters(replyMessageId);

  return {
    parse_mode: "MarkdownV2" as const,
    link_preview_options: {
      is_disabled: request.disableLinkPreview,
    },
    ...(includeReplyMarkup && request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
  };
}

/**
 * Send a sequence of preformatted text chunks, optionally attaching buttons to the last one.
 */
async function sendMessageChunks(
  bot: Bot,
  request: ParsedActionInputs,
  chunks: string[],
  initialReplyMessageId?: number,
  attachReplyMarkupToLast = false,
): Promise<number | undefined> {
  let replyMessageId = initialReplyMessageId;
  let lastMessageId: number | undefined;

  for (const [index, chunk] of chunks.entries()) {
    const isLastChunk = index === chunks.length - 1;
    const result = await bot.api.sendMessage(
      request.chatId,
      chunk,
      createMessageOptions(request, replyMessageId, attachReplyMarkupToLast && isLastChunk),
    );
    lastMessageId = result.message_id;
    replyMessageId = result.message_id;
  }

  return lastMessageId;
}

type AttachmentBatchKind = "visual" | "audio" | "document" | "single";

function getAttachmentBatchKind(type: AttachmentType): AttachmentBatchKind {
  if (type === "photo" || type === "video") {
    return "visual";
  }

  if (type === "audio") {
    return "audio";
  }

  if (type === "document") {
    return "document";
  }

  return "single";
}

function createMediaGroupBatches(items: ParsedAttachmentItem[]): ParsedAttachmentItem[][] {
  const batches: ParsedAttachmentItem[][] = [];
  let currentBatch: ParsedAttachmentItem[] = [];
  let currentKind: AttachmentBatchKind | undefined;

  for (const item of items) {
    const itemKind = getAttachmentBatchKind(item.type);

    if (
      currentBatch.length === 0 ||
      (currentKind === itemKind && currentKind !== "single" && currentBatch.length < TELEGRAM_MEDIA_GROUP_LIMIT)
    ) {
      currentBatch.push(item);
      currentKind = itemKind;
      continue;
    }

    batches.push(currentBatch);
    currentBatch = [item];
    currentKind = itemKind;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function createMediaGroupItem(item: ParsedAttachmentItem) {
  if (item.type === "animation") {
    throw new Error("animation attachments are not supported inside Telegram media groups");
  }

  return MEDIA_GROUP_BUILDERS[item.type](item.source.value, {
    ...(item.caption ? { caption: item.caption, parse_mode: "MarkdownV2" as const } : {}),
    ...(item.type === "document" ? { disable_content_type_detection: true } : {}),
  });
}

async function sendAttachmentBatch(
  bot: Bot,
  request: ParsedActionInputs,
  items: ParsedAttachmentItem[],
  replyMessageId?: number,
): Promise<number> {
  if (items.length === 1) {
    const [item] = items;
    const result = await ATTACHMENT_SENDERS[item.type](
      bot,
      request.chatId,
      item.source.value,
      createAttachmentOptions(request, item.type, replyMessageId, item.caption, false),
    );
    return result.message_id;
  }

  const messages = await bot.api.sendMediaGroup(
    request.chatId,
    items.map((item) => createMediaGroupItem(item)),
    {
      ...(replyMessageId ? { reply_parameters: { message_id: replyMessageId } } : {}),
    },
  );

  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    throw new Error("Telegram sendMediaGroup returned no messages");
  }

  return lastMessage.message_id;
}

async function sendAttachmentItems(bot: Bot, request: ParsedActionInputs): Promise<{ message_id: number }> {
  const introChunks = request.message ? splitTelegramMessage(request.message, TELEGRAM_MESSAGE_LIMIT) : [];
  const introTailMessageId = await sendMessageChunks(
    bot,
    request,
    introChunks,
    request.replyMessageId,
    Boolean(request.replyMarkup),
  );

  let previousMessageId = introTailMessageId ?? request.replyMessageId;
  const batches = createMediaGroupBatches(request.attachmentItems ?? []);

  for (const batch of batches) {
    previousMessageId = await sendAttachmentBatch(bot, request, batch, previousMessageId);
  }

  if (!previousMessageId) {
    throw new Error("failed to send any attachment messages");
  }

  return { message_id: previousMessageId };
}

function buildAttachmentCaptionPlan(message?: string): { leadingChunks: string[]; caption?: string } {
  if (!message) {
    return { leadingChunks: [] };
  }

  const formattedMessage = formatTelegramMessage(message);
  if (formattedMessage.length <= TELEGRAM_CAPTION_LIMIT) {
    return { leadingChunks: [], caption: formattedMessage };
  }

  const messageChunks = splitTelegramMessage(message, TELEGRAM_MESSAGE_LIMIT);
  const lastChunk = messageChunks.at(-1);

  if (lastChunk && lastChunk.length <= TELEGRAM_CAPTION_LIMIT) {
    return {
      leadingChunks: messageChunks.slice(0, -1),
      caption: lastChunk,
    };
  }

  return {
    leadingChunks: messageChunks,
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

  if (request.attachmentItems && request.attachmentItems.length > 0) {
    logActRequestSummary({
      scenarioId: request.scenarioId,
      method: `sendMediaGroup/batch (${request.attachmentItems.length} items)`,
      chatId: request.chatId,
      message: request.message,
      disableLinkPreview: request.disableLinkPreview,
      replyMessageId: request.replyMessageId,
      replyMarkup: request.replyMarkup,
    });

    return sendAttachmentItems(bot, request);
  }

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

    const captionPlan = buildAttachmentCaptionPlan(request.message);
    const attachReplyMarkupToText = Boolean(request.replyMarkup) && !captionPlan.caption;
    const chainTailMessageId = await sendMessageChunks(
      bot,
      request,
      captionPlan.leadingChunks,
      request.replyMessageId,
      attachReplyMarkupToText,
    );

    return ATTACHMENT_SENDERS[request.attachmentType](
      bot,
      request.chatId,
      request.attachmentSource.value,
      createAttachmentOptions(
        request,
        request.attachmentType,
        chainTailMessageId ?? request.replyMessageId,
        captionPlan.caption,
        !attachReplyMarkupToText,
      ),
    );
  }

  const messageChunks = splitTelegramMessage(request.message ?? "", TELEGRAM_MESSAGE_LIMIT);

  logActRequestSummary({
    scenarioId: request.scenarioId,
    method: messageChunks.length > 1 ? `sendMessage x${messageChunks.length}` : "sendMessage",
    chatId: request.chatId,
    message: request.message,
    disableLinkPreview: request.disableLinkPreview,
    replyMessageId: request.replyMessageId,
    replyMarkup: request.replyMarkup,
  });

  const lastMessageId = await sendMessageChunks(bot, request, messageChunks, request.replyMessageId, true);

  if (!lastMessageId) {
    throw new Error("failed to send any Telegram messages");
  }

  return { message_id: lastMessageId };
}
