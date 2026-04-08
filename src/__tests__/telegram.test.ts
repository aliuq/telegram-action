import { InputFile } from 'grammy/web';
import { describe, expect, test, vi } from 'vitest';
import { createTelegramBot, sendTextMessage } from '../telegram.js';
import type { ParsedActionInputs } from '../types.js';

function createRequest(overrides: Partial<ParsedActionInputs> = {}): ParsedActionInputs {
  return {
    botToken: 'token',
    chatId: '@example',
    message: 'hello',
    disableLinkPreview: true,
    supportsStreaming: false,
    ...overrides,
  };
}

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
});
