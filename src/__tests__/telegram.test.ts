import { InputFile } from 'grammy/web';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../logger.js';
import { createTelegramBot, sendTextMessage } from '../telegram.js';
import type { ParsedActionInputs } from '../types.js';

function createRequest(overrides: Partial<ParsedActionInputs> = {}): ParsedActionInputs {
  return {
    botToken: 'token',
    chatId: '@example',
    message: 'hello',
    disableLinkPreview: true,
    supportsStreaming: false,
    exitOnFail: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sendTextMessage', () => {
  test('skips typing indicator for channels', async () => {
    const api = {
      editMessageReplyMarkup: vi.fn(),
      getChat: vi.fn().mockResolvedValue({ type: 'channel' }),
      sendChatAction: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
    };

    await sendTextMessage({ api }, createRequest());

    expect(api.getChat).toHaveBeenCalledWith('@example');
    expect(api.sendChatAction).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledOnce();
  });

  test('sends typing indicator for private chats without inspecting the chat', async () => {
    const api = {
      editMessageReplyMarkup: vi.fn(),
      getChat: vi.fn(),
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
    };

    await sendTextMessage({ api }, createRequest({ chatId: '123456' }));

    expect(api.getChat).not.toHaveBeenCalled();
    expect(api.sendChatAction).toHaveBeenCalledWith('123456', 'typing', {});
    expect(api.sendMessage).toHaveBeenCalledOnce();
  });

  test('sends typing indicator for topic targets without inspecting the chat', async () => {
    const api = {
      editMessageReplyMarkup: vi.fn(),
      getChat: vi.fn(),
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
    };

    await sendTextMessage({ api }, createRequest({ chatId: '-1001234567890', topicId: 42 }));

    expect(api.getChat).not.toHaveBeenCalled();
    expect(api.sendChatAction).toHaveBeenCalledWith('-1001234567890', 'typing', {
      message_thread_id: 42,
    });
    expect(api.sendMessage).toHaveBeenCalledOnce();
  });

  test('creates multipart requests with duplex enabled for Node fetch', async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { message_id: 123 } }),
    });

    const bot = createTelegramBot('token', { fetch });

    await bot.api.sendDocument('123456', new InputFile(new Uint8Array([1, 2, 3]), 'test.txt'));

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ duplex: 'half' }));
  });

  test('retries transient Telegram server errors for text messages', async () => {
    vi.useFakeTimers();

    const api = {
      editMessageReplyMarkup: vi.fn(),
      getChat: vi.fn(),
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('Internal Server Error'), {
            error_code: 500,
            description: 'Internal Server Error',
          }),
        )
        .mockResolvedValue({ message_id: 123 }),
    };

    const sendPromise = sendTextMessage({ api }, createRequest({ chatId: '123456' }));

    await vi.runAllTimersAsync();

    await expect(sendPromise).resolves.toEqual({ message_id: 123 });
    expect(api.sendMessage).toHaveBeenCalledTimes(2);
  });

  test('retries transient Telegram network errors for text messages', async () => {
    vi.useFakeTimers();

    const api = {
      editMessageReplyMarkup: vi.fn(),
      getChat: vi.fn(),
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("Network request for 'sendMessage' failed!"), {
            cause: Object.assign(new Error('fetch failed'), {
              name: 'ConnectTimeoutError',
            }),
          }),
        )
        .mockResolvedValue({ message_id: 123 }),
    };

    const sendPromise = sendTextMessage({ api }, createRequest({ chatId: '123456' }));

    await vi.runAllTimersAsync();

    await expect(sendPromise).resolves.toEqual({ message_id: 123 });
    expect(api.sendMessage).toHaveBeenCalledTimes(2);
  });
});
