import { afterEach, describe, expect, test, vi } from 'vitest';
import { parseActionInputs } from '../inputs.js';
import type { RawActionInputs } from '../types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function createRawInputs(overrides: Partial<RawActionInputs> = {}): RawActionInputs {
  return {
    scenarioId: undefined,
    botToken: 'test-bot-token',
    chatId: '123456',
    message: 'Deploy finished',
    messageFile: '',
    messageUrl: '',
    buttons: '',
    topicId: '',
    replyToMessageId: '',
    disableLinkPreview: 'true',
    attachment: '',
    attachments: '',
    attachmentType: '',
    attachmentFilename: '',
    supportsStreaming: 'false',
    exitOnFail: 'true',
    ...overrides,
  };
}

describe('parseActionInputs', () => {
  test('keeps supported button styles in the parsed reply markup', async () => {
    const result = await parseActionInputs(
      createRawInputs({
        buttons: '[{"text":"Open deploy","url":"https://example.com/deploy","style":"primary"}]',
      }),
    );

    expect(result.replyMarkup).toEqual({
      inline_keyboard: [
        [
          expect.objectContaining({
            text: 'Open deploy',
            url: 'https://example.com/deploy',
            style: 'primary',
          }),
        ],
      ],
    });
  });

  test('rejects unsupported button styles during input validation', async () => {
    await expect(
      parseActionInputs(
        createRawInputs({
          buttons: '[{"text":"Open deploy","url":"https://example.com/deploy","style":"rainbow"}]',
        }),
      ),
    ).rejects.toThrow(
      'button "Open deploy" has invalid "style"; expected one of: primary, success, danger',
    );
  });

  test('parses exit_on_fail into a boolean request flag', async () => {
    const result = await parseActionInputs(
      createRawInputs({
        exitOnFail: 'false',
      }),
    );

    expect(result.exitOnFail).toBe(false);
  });

  test('validation mode does not fetch remote message_url content', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await parseActionInputs(
      createRawInputs({
        message: '',
        messageUrl: 'https://93.184.216.34/message.txt',
      }),
      {
        resolveRemoteMessageUrl: false,
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.message).toBe('[message_url content omitted during validation]');
  });
});
