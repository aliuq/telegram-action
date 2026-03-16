import * as core from "@actions/core";
import { Bot } from "grammy";
import { logActRequestSummary } from "./act-logging.js";
import {
  ATTACHMENT_METHOD_NAMES,
  ATTACHMENT_SENDERS,
  MAX_DRAFT_RETRIES,
  MEDIA_GROUP_BUILDERS,
  STREAMING_FRAME_DELAY_MAX_MS,
  STREAMING_FRAME_DELAY_MIN_MS,
  STREAMING_FRAME_DELAY_MS,
  STREAMING_MULTI_CHUNK_FRAMES,
  STREAMING_MULTI_CHUNK_TOTAL_FRAME_BUDGET,
  STREAMING_SINGLE_CHUNK_FRAMES,
  TELEGRAM_MEDIA_GROUP_LIMIT,
  TYPING_REFRESH_INTERVAL_MS,
} from "./constants.js";
import {
  buildStreamingFrames,
  formatTelegramMessage,
  splitTelegramMessageChunks,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_MESSAGE_LIMIT,
} from "./messages.js";
import type { AttachmentType, ParsedActionInputs, ParsedAttachmentItem } from "./types.js";

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

interface RetryRateLimitOptions {
  maxRetries: number;
  label: string;
}

async function sleepWithWarningCountdown(message: string, seconds: number): Promise<void> {
  if (!process.stderr.isTTY) {
    core.warning(message);
    await sleep(seconds * 1000);
    return;
  }

  for (let remainingSeconds = seconds; remainingSeconds > 0; remainingSeconds--) {
    process.stderr.write(`\r\x1b[33m${message} Retrying in ${remainingSeconds}s...\x1b[0m`);
    await sleep(1000);
  }

  process.stderr.write("\n");
}

async function retryOnRateLimit<T>(operation: () => Promise<T>, options: RetryRateLimitOptions): Promise<T> {
  let retries = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      const retryAfterSeconds = getRetryAfterSeconds(error);
      if (retryAfterSeconds === undefined) {
        throw error;
      }

      retries++;
      if (retries >= options.maxRetries) {
        throw new Error(
          `${options.label} rate-limited ${options.maxRetries} times — aborting to avoid hanging indefinitely.`,
        );
      }

      await sleepWithWarningCountdown(
        `${options.label} rate-limited by Telegram (${retries}/${options.maxRetries}).`,
        retryAfterSeconds,
      );
    }
  }
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
    ...(request.topicId !== undefined ? { message_thread_id: request.topicId } : {}),
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
    return await retryOnRateLimit(
      () =>
        bot.api.sendMessage(
          request.chatId,
          formattedChunk,
          createMessageOptions(request, replyMessageId, includeReplyMarkup),
        ),
      {
        maxRetries: MAX_DRAFT_RETRIES,
        label: "Text chunk",
      },
    );
  } catch (error) {
    if (!isDraftParseError(error) || rawChunk.length > TELEGRAM_MESSAGE_LIMIT) {
      throw error;
    }

    core.warning(
      `Telegram rejected MarkdownV2 for a text chunk; falling back to plain text. ` +
        `scenarioId=${request.scenarioId} rawLength=${rawChunk.length} formattedLength=${formattedChunk.length} ` +
        `error="${getTelegramErrorDescription(error)}" preview="${summarizeChunkForLogs(rawChunk)}"`,
    );
    return await retryOnRateLimit(
      () =>
        bot.api.sendMessage(
          request.chatId,
          rawChunk,
          createPlainMessageOptions(request, replyMessageId, includeReplyMarkup),
        ),
      {
        maxRetries: MAX_DRAFT_RETRIES,
        label: "Plain-text fallback chunk",
      },
    );
  }
}

async function sendDraftFrame(bot: TextTransportBot, chatId: number, draftId: number, frame: string): Promise<void> {
  try {
    await retryOnRateLimit(() => bot.api.sendMessageDraft(chatId, draftId, frame, createDraftMessageOptions()), {
      maxRetries: MAX_DRAFT_RETRIES,
      label: "Draft frame",
    });
  } catch (error) {
    // Draft frames are ephemeral — skip ones Telegram rejects due to parse
    // errors rather than crashing the entire stream.
    if (isDraftParseError(error)) {
      return;
    }

    throw error;
  }
}

async function closeBotResources(bot: Bot): Promise<void> {
  if ("raw" in bot.api && typeof bot.api.raw === "object" && bot.api.raw !== null) {
    const maybeClose = Reflect.get(bot.api.raw as Record<string, unknown>, "close");
    if (typeof maybeClose === "function") {
      try {
        await (maybeClose as (signal?: AbortSignal) => Promise<true>).call(bot.api.raw);
      } catch {
        // Action mode uses plain Bot API calls rather than long polling, so
        // cleanup is best-effort only.
      }
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
    ...(request.topicId !== undefined ? { message_thread_id: request.topicId } : {}),
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
    ...(request.topicId !== undefined ? { message_thread_id: request.topicId } : {}),
    ...(includeReplyMarkup && request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
  };
}

function createDraftMessageOptions() {
  return {
    parse_mode: "MarkdownV2" as const,
  };
}

async function sendTypingIndicator(bot: TextTransportBot, request: ParsedActionInputs): Promise<void> {
  try {
    await bot.api.sendChatAction(request.chatId, "typing", {
      ...(request.topicId !== undefined ? { message_thread_id: request.topicId } : {}),
    });
  } catch (error) {
    core.warning(
      `Failed to send typing indicator: ${getTelegramErrorDescription(error)} ` +
        `(chatId=${request.chatId}, topicId=${request.topicId ?? "none"})`,
    );
  }
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
  let replyMessageId: number | undefined;
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
    const result = await retryOnRateLimit(
      () =>
        ATTACHMENT_SENDERS[item.type](
          bot,
          request.chatId,
          item.source.value,
          createAttachmentOptions(request, item.type, replyMessageId, item.caption, false, item.supportsStreaming),
        ),
      {
        maxRetries: MAX_DRAFT_RETRIES,
        label: `Attachment batch (${item.type})`,
      },
    );
    return result.message_id;
  }

  const messages = await retryOnRateLimit(
    () =>
      bot.api.sendMediaGroup(
        request.chatId,
        items.map((item) => createMediaGroupItem(item)),
        {
          ...(request.topicId !== undefined ? { message_thread_id: request.topicId } : {}),
          ...(replyMessageId ? { reply_parameters: { message_id: replyMessageId } } : {}),
        },
      ),
    {
      maxRetries: MAX_DRAFT_RETRIES,
      label: `Media group batch (${items.length} items)`,
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
    undefined,
    Boolean(request.replyMarkup),
  );

  let previousMessageId = introTailMessageId;
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

  if (draftChatId === undefined && messageChunks.length > 0) {
    await sendTypingIndicator(bot, request);
  }

  const lastMessageId =
    draftChatId !== undefined
      ? await streamTextWithDraftApi(bot, request, messageChunks, draftChatId)
      : await sendMessageChunks(bot, request, messageChunks, undefined, true);

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
  try {
    if (request.attachmentItems && request.attachmentItems.length > 0) {
      logActRequestSummary({
        scenarioId: request.scenarioId,
        method: `sendMediaGroup/batch (${request.attachmentItems.length} items)`,
        chatId: request.chatId,
        message: request.message,
        disableLinkPreview: request.disableLinkPreview,
        topicId: request.topicId,
        replyMessageId: request.replyMessageId,
        replyMarkup: request.replyMarkup,
      });

      return sendAttachmentItems(bot, request);
    }

    if (request.attachmentSource && request.attachmentType) {
      const attachmentType = request.attachmentType;
      const attachmentSource = request.attachmentSource;

      logActRequestSummary({
        scenarioId: request.scenarioId,
        method: ATTACHMENT_METHOD_NAMES[attachmentType],
        chatId: request.chatId,
        message: request.message,
        disableLinkPreview: request.disableLinkPreview,
        topicId: request.topicId,
        replyMessageId: request.replyMessageId,
        replyMarkup: request.replyMarkup,
        attachmentType,
        attachmentSource,
      });

      const captionPlan = buildAttachmentCaptionPlan(request.message);
      const attachReplyMarkupToText = Boolean(request.replyMarkup) && !captionPlan.caption;
      const chainTailMessageId = await sendMessageChunks(
        bot,
        request,
        captionPlan.leadingChunks,
        undefined,
        attachReplyMarkupToText,
      );

      return retryOnRateLimit(
        () =>
          ATTACHMENT_SENDERS[attachmentType](
            bot,
            request.chatId,
            attachmentSource.value,
            createAttachmentOptions(
              request,
              attachmentType,
              chainTailMessageId,
              captionPlan.caption,
              !attachReplyMarkupToText,
              request.supportsStreaming,
            ),
          ),
        {
          maxRetries: MAX_DRAFT_RETRIES,
          label: `Single attachment (${request.attachmentType})`,
        },
      );
    }

    logActRequestSummary({
      scenarioId: request.scenarioId,
      method: describeTextSendMethod(request),
      chatId: request.chatId,
      message: request.message,
      disableLinkPreview: request.disableLinkPreview,
      topicId: request.topicId,
      replyMessageId: request.replyMessageId,
      replyMarkup: request.replyMarkup,
    });

    return sendTextMessage(bot, request);
  } finally {
    await closeBotResources(bot);
  }
}
