import { describe, expect, test, vi } from 'vitest';
import { sendTextMessage } from '../telegram.js';
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
});
