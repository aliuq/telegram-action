import { Bot } from "grammy";
import { logActRequestSummary } from "./act-logging.js";
import {
  ATTACHMENT_METHOD_NAMES,
  ATTACHMENT_SENDERS,
  MEDIA_GROUP_BUILDERS,
  TELEGRAM_MEDIA_GROUP_LIMIT,
} from "./constants.js";
import {
  buildStreamingFrames,
  formatTelegramMessage,
  splitTelegramMessageChunks,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_MESSAGE_LIMIT,
} from "./messages.js";
import type { AttachmentType, ParsedActionInputs, ParsedAttachmentItem } from "./types.js";

const STREAMING_SINGLE_CHUNK_FRAMES = 15;
const STREAMING_MULTI_CHUNK_FRAMES = 8;
const STREAMING_MULTI_CHUNK_TOTAL_FRAME_BUDGET = 20;
const STREAMING_FRAME_DELAY_MS = 150;
const STREAMING_FRAME_DELAY_MIN_MS = 100;
const STREAMING_FRAME_DELAY_MAX_MS = 400;
const TYPING_REFRESH_INTERVAL_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute an inter-frame delay proportional to the new content size so shorter
 * pieces fly by and longer ones pause a bit longer — matching how a human
 * would perceive streaming text.
 */
function computeFrameDelay(pieceLength: number): number {
  const scaled = STREAMING_FRAME_DELAY_MS + pieceLength * 0.4;
  return Math.min(STREAMING_FRAME_DELAY_MAX_MS, Math.max(STREAMING_FRAME_DELAY_MIN_MS, scaled));
}

function getFramesPerChunk(chunkCount: number): number {
  if (chunkCount <= 1) {
    return STREAMING_SINGLE_CHUNK_FRAMES;
  }

  return Math.max(
    1,
    Math.min(STREAMING_MULTI_CHUNK_FRAMES, Math.floor(STREAMING_MULTI_CHUNK_TOTAL_FRAME_BUDGET / chunkCount)),
  );
}

function getRetryAfterSeconds(error: unknown): number | undefined {
  if (!(error instanceof Error) || !("error_code" in error) || error.error_code !== 429) {
    return undefined;
  }

  if (!("parameters" in error) || typeof error.parameters !== "object" || error.parameters === null) {
    return undefined;
  }

  const retryAfter = "retry_after" in error.parameters ? error.parameters.retry_after : undefined;
  return typeof retryAfter === "number" ? retryAfter : undefined;
}

function isDraftParseError(error: unknown): boolean {
  if (!(error instanceof Error) || !("error_code" in error) || error.error_code !== 400) {
    return false;
  }

  return "description" in error && typeof error.description === "string" && error.description.includes("can't parse");
}

function getTelegramErrorDescription(error: unknown): string {
  if (
    "description" in (error as Record<string, unknown>) &&
    typeof (error as Record<string, unknown>).description === "string"
  ) {
    return (error as Record<string, unknown>).description as string;
  }

  return error instanceof Error ? error.message : String(error);
}

function summarizeChunkForLogs(chunk: string): string {
  return chunk.replace(/\s+/g, " ").trim().slice(0, 160);
}

function createPlainMessageOptions(request: ParsedActionInputs, replyMessageId?: number, includeReplyMarkup = true) {
  const replyParameters = createReplyParameters(replyMessageId);

  return {
    link_preview_options: {
      is_disabled: request.disableLinkPreview,
    },
    ...(includeReplyMarkup && request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
  };
}

async function sendFormattedMessage(
  bot: TextTransportBot,
  request: ParsedActionInputs,
  rawChunk: string,
  formattedChunk: string,
  replyMessageId?: number,
  includeReplyMarkup = false,
) {
  try {
    return await bot.api.sendMessage(
      request.chatId,
      formattedChunk,
      createMessageOptions(request, replyMessageId, includeReplyMarkup),
    );
  } catch (error) {
    if (!isDraftParseError(error) || rawChunk.length > TELEGRAM_MESSAGE_LIMIT) {
      throw error;
    }

    console.warn("Telegram rejected MarkdownV2 for a text chunk; falling back to plain text.", {
      scenarioId: request.scenarioId,
      error: getTelegramErrorDescription(error),
      rawLength: rawChunk.length,
      formattedLength: formattedChunk.length,
      preview: summarizeChunkForLogs(rawChunk),
    });
    return await bot.api.sendMessage(
      request.chatId,
      rawChunk,
      createPlainMessageOptions(request, replyMessageId, includeReplyMarkup),
    );
  }
}

async function sendDraftFrame(bot: TextTransportBot, chatId: number, draftId: number, frame: string): Promise<void> {
  while (true) {
    try {
      await bot.api.sendMessageDraft(chatId, draftId, frame, createDraftMessageOptions());
      return;
    } catch (error) {
      const retryAfterSeconds = getRetryAfterSeconds(error);
      if (retryAfterSeconds !== undefined) {
        await sleep(retryAfterSeconds * 1000);
        continue;
      }

      // Draft frames are ephemeral — skip ones Telegram rejects due to parse
      // errors rather than crashing the entire stream.
      if (isDraftParseError(error)) {
        return;
      }

      throw error;
    }
  }
}

type TextTransportApi = Pick<
  Bot["api"],
  "editMessageReplyMarkup" | "sendChatAction" | "sendMessage" | "sendMessageDraft"
>;
type TextTransportBot = { api: TextTransportApi };

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
  supportsStreaming?: boolean,
) {
  const replyParameters = createReplyParameters(replyMessageId);

  return {
    ...(caption ? { caption, parse_mode: "MarkdownV2" as const } : {}),
    ...(includeReplyMarkup && request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
    ...(attachmentType === "document" ? { disable_content_type_detection: true } : {}),
    ...(attachmentType === "video" && supportsStreaming ? { supports_streaming: true } : {}),
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

function createDraftMessageOptions() {
  return {
    parse_mode: "MarkdownV2" as const,
  };
}

function getDraftStreamingChatId(chatId: string): number | undefined {
  if (!/^\d+$/.test(chatId)) {
    return undefined;
  }

  const parsedChatId = Number.parseInt(chatId, 10);
  return parsedChatId > 0 ? parsedChatId : undefined;
}

/**
 * Send a sequence of preformatted text chunks, optionally attaching buttons to the last one.
 */
async function sendMessageChunks(
  bot: TextTransportBot,
  request: ParsedActionInputs,
  chunks: { raw: string; formatted: string }[],
  initialReplyMessageId?: number,
  attachReplyMarkupToLast = false,
): Promise<number | undefined> {
  let replyMessageId = initialReplyMessageId;
  let lastMessageId: number | undefined;

  for (const [index, chunk] of chunks.entries()) {
    const isLastChunk = index === chunks.length - 1;
    const result = await sendFormattedMessage(
      bot,
      request,
      chunk.raw,
      chunk.formatted,
      replyMessageId,
      attachReplyMarkupToLast && isLastChunk,
    );
    lastMessageId = result.message_id;
    replyMessageId = result.message_id;
  }

  return lastMessageId;
}

/**
 * Stream text through project-local Telegram draft updates in supported private chats.
 */
async function streamTextWithDraftApi(
  bot: TextTransportBot,
  request: ParsedActionInputs,
  chunks: { raw: string; formatted: string }[],
  draftChatId: number,
): Promise<number | undefined> {
  const draftSeed = Date.now();
  const framesPerChunk = getFramesPerChunk(chunks.length);
  let replyMessageId = request.replyMessageId;
  let lastMessageId: number | undefined;

  // Show typing indicator so users see "typing…" at the top of the chat
  // while draft frames appear below. The indicator expires after ~5s, so
  // we refresh it periodically during long streams.
  await bot.api.sendChatAction(draftChatId, "typing");
  let lastTypingTime = Date.now();

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const isLastChunk = chunkIndex === chunks.length - 1;
    const draftId = draftSeed + chunkIndex + 1;
    // Frames are derived from the raw Markdown source, but every emitted frame is
    // formatted into a Telegram-safe MarkdownV2 payload. This lets us keep code
    // fences intact during draft streaming instead of revealing broken mid-block
    // prefixes that Telegram rejects.
    const frames = buildStreamingFrames(chunk.raw, {
      minFrames: framesPerChunk,
      maxFrames: framesPerChunk,
    });

    let previousFrameLength = 0;
    for (const [frameIndex, frame] of frames.entries()) {
      if (frameIndex > 0) {
        const newContentLength = frame.length - previousFrameLength;
        await sleep(computeFrameDelay(newContentLength));
      }

      // Refresh the typing indicator before it expires
      if (Date.now() - lastTypingTime > TYPING_REFRESH_INTERVAL_MS) {
        await bot.api.sendChatAction(draftChatId, "typing");
        lastTypingTime = Date.now();
      }

      await sendDraftFrame(bot, draftChatId, draftId, frame);
      previousFrameLength = frame.length;
    }

    // Persist the completed chunk after its last visible draft update. Long
    // stream responses therefore progress as draft -> final message cycles, and
    // later chunks reply to the previous persisted message to keep the thread readable.
    const result = await sendFormattedMessage(bot, request, chunk.raw, chunk.formatted, replyMessageId, isLastChunk);
    lastMessageId = result.message_id;
    replyMessageId = result.message_id;

    // Refresh typing before the next chunk's draft frames begin
    if (!isLastChunk) {
      await bot.api.sendChatAction(draftChatId, "typing");
      lastTypingTime = Date.now();
    }
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
    ...(item.type === "video" && item.supportsStreaming ? { supports_streaming: true } : {}),
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
      createAttachmentOptions(request, item.type, replyMessageId, item.caption, false, item.supportsStreaming),
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
  const introChunks = request.message ? splitTelegramMessageChunks(request.message, TELEGRAM_MESSAGE_LIMIT) : [];
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

function buildAttachmentCaptionPlan(message?: string): {
  leadingChunks: { raw: string; formatted: string }[];
  caption?: string;
} {
  if (!message) {
    return { leadingChunks: [] };
  }

  // Skip the full-message format when the raw text already exceeds the caption
  // limit — the formatted version can only be longer.
  if (message.length <= TELEGRAM_CAPTION_LIMIT) {
    const formattedMessage = formatTelegramMessage(message);
    if (formattedMessage.length <= TELEGRAM_CAPTION_LIMIT) {
      return { leadingChunks: [], caption: formattedMessage };
    }
  }

  const messageChunks = splitTelegramMessageChunks(message, TELEGRAM_MESSAGE_LIMIT);
  const lastChunk = messageChunks.at(-1);

  if (lastChunk && lastChunk.formatted.length <= TELEGRAM_CAPTION_LIMIT) {
    return {
      leadingChunks: messageChunks.slice(0, -1),
      caption: lastChunk.formatted,
    };
  }

  return {
    leadingChunks: messageChunks,
  };
}

/**
 * Describe the Telegram method a text-only request will use, for logging.
 */
export function describeTextSendMethod(request: ParsedActionInputs): string {
  const messageChunks = splitTelegramMessageChunks(request.message ?? "", TELEGRAM_MESSAGE_LIMIT);
  const draftChatId = request.streamResponse ? getDraftStreamingChatId(request.chatId) : undefined;

  if (request.streamResponse && draftChatId !== undefined) {
    return messageChunks.length > 1
      ? `sendMessageDraft -> sendMessage x${messageChunks.length}`
      : "sendMessageDraft -> sendMessage";
  }

  return messageChunks.length > 1 ? `sendMessage x${messageChunks.length}` : "sendMessage";
}

/**
 * Send the text-only path with either normal sends or streaming edits.
 */
export async function sendTextMessage(
  bot: TextTransportBot,
  request: ParsedActionInputs,
): Promise<{ message_id: number }> {
  const messageChunks = splitTelegramMessageChunks(request.message ?? "", TELEGRAM_MESSAGE_LIMIT);
  const draftChatId = request.streamResponse ? getDraftStreamingChatId(request.chatId) : undefined;

  const lastMessageId =
    draftChatId !== undefined
      ? await streamTextWithDraftApi(bot, request, messageChunks, draftChatId)
      : await sendMessageChunks(bot, request, messageChunks, request.replyMessageId, true);

  if (!lastMessageId) {
    throw new Error("failed to send any Telegram messages");
  }

  return { message_id: lastMessageId };
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
        request.supportsStreaming,
      ),
    );
  }

  logActRequestSummary({
    scenarioId: request.scenarioId,
    method: describeTextSendMethod(request),
    chatId: request.chatId,
    message: request.message,
    disableLinkPreview: request.disableLinkPreview,
    replyMessageId: request.replyMessageId,
    replyMarkup: request.replyMarkup,
  });

  return sendTextMessage(bot, request);
}
