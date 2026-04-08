import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const setOutput = vi.fn();

vi.mock('@actions/core', () => ({
  setOutput,
}));

const readRawActionInputs = vi.fn();
const parseExitOnFailInput = vi.fn();
const parseActionInputs = vi.fn();

vi.mock('../inputs.js', () => ({
  readRawActionInputs,
  parseExitOnFailInput,
  parseActionInputs,
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

describe('runAction', () => {
  const originalExitCode = process.exitCode;
  const originalExpectedFailure = process.env.TELEGRAM_ACTION_EXPECT_FAILURE;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    isActRun.mockReturnValue(false);
    process.exitCode = undefined;
    delete process.env.TELEGRAM_ACTION_EXPECT_FAILURE;
  });

  afterEach(() => {
    if (originalExpectedFailure === undefined) {
      delete process.env.TELEGRAM_ACTION_EXPECT_FAILURE;
    } else {
      process.env.TELEGRAM_ACTION_EXPECT_FAILURE = originalExpectedFailure;
    }

    process.exitCode = originalExitCode;
  });

  test('sets success outputs after a successful send', async () => {
    readRawActionInputs.mockReturnValue({ exitOnFail: 'true' });
    parseExitOnFailInput.mockReturnValue(true);
    parseActionInputs.mockResolvedValue({ chatId: '123456' });
    sendTelegramMessage.mockResolvedValue({ message_id: 42 });

    const { runAction } = await import('../action.js');
    await runAction();

    expect(setOutput).toHaveBeenNthCalledWith(1, 'message_id', '42');
    expect(setOutput).toHaveBeenNthCalledWith(2, 'status', 'success');
    expect(logger.fail).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('logs a warning instead of failing the step when exit_on_fail is false', async () => {
    const error = new Error('Telegram API temporarily unavailable');

    readRawActionInputs.mockReturnValue({ exitOnFail: 'false' });
    parseExitOnFailInput.mockReturnValue(false);
    parseActionInputs.mockRejectedValue(error);

    const { runAction } = await import('../action.js');
    await runAction();

    expect(setOutput).toHaveBeenCalledWith('status', 'failure');
    expect(logger.warn).toHaveBeenCalledWith(
      'Telegram API temporarily unavailable. Continuing because exit_on_fail is false.',
    );
    expect(logger.fail).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('fails the step when exit_on_fail is true', async () => {
    const error = new Error('Missing TELEGRAM_BOT_TOKEN');

    readRawActionInputs.mockReturnValue({ exitOnFail: 'true' });
    parseExitOnFailInput.mockReturnValue(true);
    parseActionInputs.mockRejectedValue(error);

    const { runAction } = await import('../action.js');
    await runAction();

    expect(setOutput).toHaveBeenCalledWith('status', 'failure');
    expect(logger.fail).toHaveBeenCalledWith('Missing TELEGRAM_BOT_TOKEN');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('keeps expected-failure runs nonzero for act assertions', async () => {
    process.env.TELEGRAM_ACTION_EXPECT_FAILURE = 'true';

    readRawActionInputs.mockReturnValue({ exitOnFail: 'false' });
    parseExitOnFailInput.mockReturnValue(false);
    parseActionInputs.mockRejectedValue(new Error('invalid buttons'));

    const { runAction } = await import('../action.js');
    await runAction();

    expect(setOutput).toHaveBeenCalledWith('status', 'failure');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.fail).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
