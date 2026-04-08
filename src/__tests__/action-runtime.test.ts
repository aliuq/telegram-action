import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const getInput = vi.fn<(name: string) => string>();
const setOutput = vi.fn();

vi.mock('@actions/core', () => ({
  getInput,
  setOutput,
}));

const sendTelegramMessage = vi.fn();

vi.mock('../telegram.js', () => ({
  sendTelegramMessage,
}));

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  fail: vi.fn(),
  withGroup: vi.fn(async (_label: string, fn: () => Promise<unknown> | unknown) => await fn()),
};

vi.mock('../logger.js', () => ({
  logger,
}));

const isActRun = vi.fn();
const logActErrorDetails = vi.fn();

vi.mock('../act-logging.js', () => ({
  isActRun,
  logActErrorDetails,
}));

function setMockInputs(inputs: Record<string, string>): void {
  getInput.mockImplementation((name: string) => inputs[name] ?? '');
}

describe('runAction with real input parsing', () => {
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    isActRun.mockReturnValue(false);
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_CHAT_ID = '123456';
    process.exitCode = undefined;
  });

  afterEach(() => {
    if (originalBotToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    }

    if (originalChatId === undefined) {
      delete process.env.TELEGRAM_CHAT_ID;
    } else {
      process.env.TELEGRAM_CHAT_ID = originalChatId;
    }

    process.exitCode = originalExitCode;
  });

  test('keeps the step green for parser failures when exit_on_fail is false', async () => {
    setMockInputs({
      message: 'Deploy finished',
      buttons: '[{"url":"https://example.com"}]',
      exit_on_fail: 'false',
    });

    const { runAction } = await import('../action.js');
    await runAction();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(setOutput).toHaveBeenCalledWith('status', 'failure');
    expect(logger.warn).toHaveBeenCalledWith(
      'button is missing required "text" field: {"url":"https://example.com"}. Continuing because exit_on_fail is false.',
    );
    expect(logger.fail).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('accepts the camelCase exitOnFail alias at the input boundary', async () => {
    setMockInputs({
      message: 'Deploy finished',
      buttons: '[{"url":"https://example.com"}]',
      exitOnFail: 'false',
    });

    const { runAction } = await import('../action.js');
    await runAction();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(setOutput).toHaveBeenCalledWith('status', 'failure');
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.fail).not.toHaveBeenCalled();
  });
});
