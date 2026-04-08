import * as core from '@actions/core';
import { isActRun, logActErrorDetails } from './act-logging.js';
import { parseActionInputs, parseExitOnFailInput, readRawActionInputs } from './inputs.js';
import { logger } from './logger.js';
import { sendTelegramMessage } from './telegram.js';

function shouldSuppressFailureAnnotations(): boolean {
  return process.env.TELEGRAM_ACTION_EXPECT_FAILURE === 'true';
}

/**
 * Read, normalize, and execute the action request.
 *
 * The entry point stays intentionally small so the behavior is easy to follow:
 * read inputs, normalize them, send the request, then expose outputs.
 */
export async function runAction(): Promise<void> {
  let exitOnFail = true;

  try {
    const rawInputs = readRawActionInputs();
    exitOnFail = parseExitOnFailInput(rawInputs.exitOnFail);

    const request = await parseActionInputs(rawInputs);
    const result = await sendTelegramMessage(request);

    core.setOutput('message_id', result.message_id.toString());
    core.setOutput('status', 'success');

    if (isActRun()) {
      logger.info(`[act] Sent Telegram message successfully (message_id=${result.message_id})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);

    core.setOutput('status', 'failure');

    if (isActRun()) {
      await logger.withGroup('telegram-action failure', () => {
        logger.info(details);
      });
    }
    logActErrorDetails(error);

    if (shouldSuppressFailureAnnotations()) {
      process.exitCode = 1;
      return;
    }

    if (!exitOnFail) {
      logger.warn(`${message}. Continuing because exit_on_fail is false.`);
      return;
    }

    logger.fail(message);
  }
}
