import { Bot } from 'grammy';
import { logActRequestSummary } from './act-logging.js';
import {
  ATTACHMENT_METHOD_NAMES,
  ATTACHMENT_SENDERS,
  MAX_DRAFT_RETRIES,
  MEDIA_GROUP_BUILDERS,
  TELEGRAM_MEDIA_GROUP_LIMIT,
} from './constants.js';
import { logger } from './logger.js';
import {
  formatTelegramMessage,
  splitTelegramMessageChunks,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_MESSAGE_LIMIT,
} from './messages.js';
import type { AttachmentType, ParsedActionInputs, ParsedAttachmentItem } from './types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterSeconds(error: unknown): number | undefined {
  if (!(error instanceof Error) || !('error_code' in error) || error.error_code !== 429) {
    return undefined;
  }

  if (
    !('parameters' in error) ||
    typeof error.parameters !== 'object' ||
    error.parameters === null
  ) {
    return undefined;
  }

  const retryAfter = 'retry_after' in error.parameters ? error.parameters.retry_after : undefined;
  return typeof retryAfter === 'number' ? retryAfter : undefined;
}

interface RetryRateLimitOptions {
  maxRetries: number;
  label: string;
}

async function sleepWithWarningCountdown(message: string, seconds: number): Promise<void> {
  if (!process.stderr.isTTY) {
    logger.warn(message);
    logger.warn(`Retrying in ${seconds}s...`);
    await sleep(seconds * 1000);
    return;
  }

  for (let remainingSeconds = seconds; remainingSeconds > 0; remainingSeconds--) {
    process.stderr.write(`\r\x1b[33m${message} Retrying in ${remainingSeconds}s...\x1b[0m`);
    await sleep(1000);
  }

  process.stderr.write('\n');
}

async function retryOnRateLimit<T>(
  operation: () => Promise<T>,
  options: RetryRateLimitOptions,
): Promise<T> {
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
  if (!(error instanceof Error) || !('error_code' in error) || error.error_code !== 400) {
    return false;
  }

  return (
    'description' in error &&
    typeof error.description === 'string' &&
    error.description.includes("can't parse")
  );
}

function getTelegramErrorDescription(error: unknown): string {
  if (
    'description' in (error as Record<string, unknown>) &&
    typeof (error as Record<string, unknown>).description === 'string'
  ) {
    return (error as Record<string, unknown>).description as string;
  }

  return error instanceof Error ? error.message : String(error);
}

function summarizeChunkForLogs(chunk: string): string {
  return chunk.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function createPlainMessageOptions(
  request: ParsedActionInputs,
  replyMessageId?: number,
  includeReplyMarkup = true,
) {
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
        label: 'Text chunk',
      },
    );
  } catch (error) {
    if (!isDraftParseError(error) || rawChunk.length > TELEGRAM_MESSAGE_LIMIT) {
      throw error;
    }

    logger.warn(
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
        label: 'Plain-text fallback chunk',
      },
    );
  }
}

async function closeBotResources(bot: Bot): Promise<void> {
  if ('raw' in bot.api && typeof bot.api.raw === 'object' && bot.api.raw !== null) {
    const maybeClose = Reflect.get(bot.api.raw as Record<string, unknown>, 'close');
    if (typeof maybeClose === 'function') {
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
  Bot['api'],
  'editMessageReplyMarkup' | 'getChat' | 'sendChatAction' | 'sendMessage'
>;
type TextTransportBot = { api: TextTransportApi };
type TextTransportChat = Awaited<ReturnType<TextTransportApi['getChat']>>;

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
    ...(caption ? { caption, parse_mode: 'MarkdownV2' as const } : {}),
    ...(request.topicId !== undefined ? { message_thread_id: request.topicId } : {}),
    ...(includeReplyMarkup && request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
    ...(attachmentType === 'document' ? { disable_content_type_detection: true } : {}),
    ...(attachmentType === 'video' && supportsStreaming ? { supports_streaming: true } : {}),
  };
}

/**
 * Build `sendMessage` options separately because link preview settings only apply
 * to plain text messages.
 */
function createMessageOptions(
  request: ParsedActionInputs,
  replyMessageId?: number,
  includeReplyMarkup = true,
) {
  const replyParameters = createReplyParameters(replyMessageId);

  return {
    parse_mode: 'MarkdownV2' as const,
    link_preview_options: {
      is_disabled: request.disableLinkPreview,
    },
    ...(request.topicId !== undefined ? { message_thread_id: request.topicId } : {}),
    ...(includeReplyMarkup && request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
    ...(replyParameters ? { reply_parameters: replyParameters } : {}),
  };
}

async function sendTypingIndicator(
  bot: TextTransportBot,
  request: ParsedActionInputs,
): Promise<void> {
  if (!(await supportsTypingIndicator(bot, request))) {
    return;
  }

  try {
    await bot.api.sendChatAction(request.chatId, 'typing', {
      ...(request.topicId !== undefined ? { message_thread_id: request.topicId } : {}),
    });
  } catch (error) {
    logger.warn(
      `Failed to send typing indicator: ${getTelegramErrorDescription(error)} ` +
        `(chatId=${request.chatId}, topicId=${request.topicId ?? 'none'})`,
    );
  }
}

function chatSupportsTypingIndicator(chat: TextTransportChat): boolean {
  return chat.type !== 'channel';
}

async function supportsTypingIndicator(
  bot: TextTransportBot,
  request: ParsedActionInputs,
): Promise<boolean> {
  try {
    const chat = await bot.api.getChat(request.chatId);
    if (chatSupportsTypingIndicator(chat)) {
      return true;
    }

    logger.info(
      `Skipping typing indicator for unsupported chat type: ${chat.type} ` +
        `(chatId=${request.chatId}, topicId=${request.topicId ?? 'none'})`,
    );
    return false;
  } catch (error) {
    logger.warn(
      `Failed to inspect chat before typing indicator: ${getTelegramErrorDescription(error)} ` +
        `(chatId=${request.chatId}, topicId=${request.topicId ?? 'none'})`,
    );
    return false;
  }
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

type AttachmentBatchKind = 'visual' | 'audio' | 'document' | 'single';

function getAttachmentBatchKind(type: AttachmentType): AttachmentBatchKind {
  if (type === 'photo' || type === 'video') {
    return 'visual';
  }

  if (type === 'audio') {
    return 'audio';
  }

  if (type === 'document') {
    return 'document';
  }

  return 'single';
}

function createMediaGroupBatches(items: ParsedAttachmentItem[]): ParsedAttachmentItem[][] {
  const batches: ParsedAttachmentItem[][] = [];
  let currentBatch: ParsedAttachmentItem[] = [];
  let currentKind: AttachmentBatchKind | undefined;

  for (const item of items) {
    const itemKind = getAttachmentBatchKind(item.type);

    if (
      currentBatch.length === 0 ||
      (currentKind === itemKind &&
        currentKind !== 'single' &&
        currentBatch.length < TELEGRAM_MEDIA_GROUP_LIMIT)
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
  if (item.type === 'animation') {
    throw new Error('animation attachments are not supported inside Telegram media groups');
  }

  return MEDIA_GROUP_BUILDERS[item.type](item.source.value, {
    ...(item.caption ? { caption: item.caption, parse_mode: 'MarkdownV2' as const } : {}),
    ...(item.type === 'document' ? { disable_content_type_detection: true } : {}),
    ...(item.type === 'video' && item.supportsStreaming ? { supports_streaming: true } : {}),
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
          createAttachmentOptions(
            request,
            item.type,
            replyMessageId,
            item.caption,
            false,
            item.supportsStreaming,
          ),
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
          ...(replyMessageId !== undefined
            ? { reply_parameters: { message_id: replyMessageId } }
            : {}),
        },
      ),
    {
      maxRetries: MAX_DRAFT_RETRIES,
      label: `Media group batch (${items.length} items)`,
    },
  );

  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    throw new Error('Telegram sendMediaGroup returned no messages');
  }

  return lastMessage.message_id;
}

async function sendAttachmentItems(
  bot: Bot,
  request: ParsedActionInputs,
): Promise<{ message_id: number }> {
  const introChunks = request.message
    ? splitTelegramMessageChunks(request.message, TELEGRAM_MESSAGE_LIMIT)
    : [];
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
    throw new Error('failed to send any attachment messages');
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
  const messageChunks = splitTelegramMessageChunks(request.message ?? '', TELEGRAM_MESSAGE_LIMIT);

  return messageChunks.length > 1 ? `sendMessage x${messageChunks.length}` : 'sendMessage';
}

/**
 * Send the text-only path with either normal sends or streaming edits.
 */
export async function sendTextMessage(
  bot: TextTransportBot,
  request: ParsedActionInputs,
): Promise<{ message_id: number }> {
  const messageChunks = splitTelegramMessageChunks(request.message ?? '', TELEGRAM_MESSAGE_LIMIT);
  if (messageChunks.length > 0) {
    await sendTypingIndicator(bot, request);
  }

  const lastMessageId = await sendMessageChunks(
    bot,
    request,
    messageChunks,
    request.replyMessageId,
    true,
  );

  if (!lastMessageId) {
    throw new Error('failed to send any Telegram messages');
  }

  return { message_id: lastMessageId };
}

/**
 * Send the normalized Telegram request.
 *
 * The entry point stays tiny while transport details live here, which makes new
 * behaviors easier to add without reopening the parsing layer.
 */
export async function sendTelegramMessage(
  request: ParsedActionInputs,
): Promise<{ message_id: number }> {
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
        request.replyMessageId,
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
              chainTailMessageId ?? request.replyMessageId,
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
