import * as core from "@actions/core";
import { isActRun, logActErrorDetails } from "./act-logging.js";
import { parseActionInputs, readRawActionInputs } from "./inputs.js";
import { sendTelegramMessage } from "./telegram.js";

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

    core.setOutput("message_id", result.message_id.toString());
    core.setOutput("status", "success");

    if (isActRun()) {
      core.info(`[act] Sent Telegram message successfully (message_id=${result.message_id})`);
    }
  } catch (error) {
    core.error(error instanceof Error ? (error.stack ?? error.message) : String(error));

    logActErrorDetails(error);
    if (error instanceof Error) {
      core.setFailed(error.message);
      return;
    }

    core.setFailed("An unexpected error occurred");
  }
}

void run();
