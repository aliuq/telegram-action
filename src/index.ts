import * as core from '@actions/core';
import { isActRun, logActErrorDetails } from './act-logging.js';
import { parseActionInputs, readRawActionInputs } from './inputs.js';
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
export async function run(): Promise<void> {
  try {
    const request = await parseActionInputs(readRawActionInputs());
    const result = await sendTelegramMessage(request);

    core.setOutput('message_id', result.message_id.toString());
    core.setOutput('status', 'success');

    if (isActRun()) {
      logger.info(`[act] Sent Telegram message successfully (message_id=${result.message_id})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);

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

    logger.fail(message);
  }
}

void run();
