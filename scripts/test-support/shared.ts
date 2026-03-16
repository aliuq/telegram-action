import { ATTACHMENT_METHOD_NAMES } from "../../src/constants.ts";
import { getRequiredEnv } from "../../src/env.ts";
import { parseActionInputs } from "../../src/inputs.ts";
import { describeTextSendMethod } from "../../src/telegram.ts";
import type { ParsedActionInputs, RawActionInputs, ScenarioDefinition } from "../../src/types.ts";
import { TEST_MESSAGE_URL_OVERRIDES } from "../scenarios/shared.ts";

export const ROOT = new URL("../..", import.meta.url).pathname;
export const SECRET_FILE_PATH = new URL("../../.env", import.meta.url).pathname;
export const HISTORY_DIR = new URL("../../.history", import.meta.url).pathname;
export const LOG_DIR = new URL("../../.history/logs", import.meta.url).pathname;
export const HISTORY_FILE_PATH = new URL("../../.history/test-history.json", import.meta.url).pathname;
export const TEST_BOT_TOKEN = "test-bot-token";
export const TEST_CHAT_ID = "123456";
export const TEST_REPLY_TO_MESSAGE_ID = "42";
export const TEST_MESSAGE_URL_OVERRIDES_JSON = JSON.stringify(TEST_MESSAGE_URL_OVERRIDES);
export const RUNNER_BANNER = [
  "████████╗███████╗██╗     ███████╗ ██████╗ ██████╗  █████╗ ███╗   ███╗",
  "╚══██╔══╝██╔════╝██║     ██╔════╝██╔════╝ ██╔══██╗██╔══██╗████╗ ████║",
  "   ██║   █████╗  ██║     █████╗  ██║  ███╗██████╔╝███████║██╔████╔██║",
  "   ██║   ██╔══╝  ██║     ██╔══╝  ██║   ██║██╔══██╗██╔══██║██║╚██╔╝██║",
  "   ██║   ███████╗███████╗███████╗╚██████╔╝██║  ██║██║  ██║██║ ╚═╝ ██║",
  "   ╚═╝   ╚══════╝╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝",
  "",
  "┌  Unified Test Runner",
  "│",
] as const;

/**
 * Print the interactive runner banner.
 */
export function printBanner(): void {
  console.log(RUNNER_BANNER.join("\n"));
}

/**
 * Build the raw action input payload for a scenario in source, validate, or act mode.
 */
export function buildRawActionInputs(scenario: ScenarioDefinition, useRealEnv: boolean): RawActionInputs {
  return {
    scenarioId: scenario.id,
    botToken: useRealEnv ? getRequiredEnv("TELEGRAM_BOT_TOKEN") : TEST_BOT_TOKEN,
    chatId: useRealEnv ? getRequiredEnv("TELEGRAM_CHAT_ID") : TEST_CHAT_ID,
    message: scenario.inputs.message,
    messageFile: scenario.inputs.message_file,
    messageUrl: scenario.inputs.message_url,
    streamResponse: scenario.inputs.stream_response,
    buttons: scenario.inputs.buttons,
    replyToMessageId: scenario.inputs.reply_to_message_id
      ? useRealEnv
        ? getRequiredEnv("TELEGRAM_REPLY_TO_MESSAGE_ID")
        : TEST_REPLY_TO_MESSAGE_ID
      : "",
    disableLinkPreview: scenario.inputs.disable_link_preview,
    attachment: scenario.inputs.attachment,
    attachments: scenario.inputs.attachments,
    attachmentType: scenario.inputs.attachment_type,
    attachmentFilename: scenario.inputs.attachment_filename,
    supportsStreaming: scenario.inputs.supports_streaming,
  };
}

/**
 * Describe the primary Telegram method a parsed request will use.
 */
export function describeRequestMethod(request: ParsedActionInputs): string {
  if (request.attachmentType) {
    return ATTACHMENT_METHOD_NAMES[request.attachmentType];
  }

  if (request.attachmentItems?.length) {
    return `sendMediaGroup/batch (${request.attachmentItems.length} items)`;
  }

  return describeTextSendMethod(request);
}

/**
 * Validate the scenario catalog against the shared action parser.
 */
export async function validateScenarioCatalog(scenarios: ScenarioDefinition[]): Promise<void> {
  const seen = new Set<string>();

  for (const scenario of scenarios) {
    if (seen.has(scenario.id)) {
      throw new Error(`Duplicate scenario id: ${scenario.id}`);
    }
    seen.add(scenario.id);

    const runValidation = () => parseActionInputs(buildRawActionInputs(scenario, false));

    if (scenario.expect_failure) {
      try {
        await runValidation();
      } catch {
        continue;
      }

      throw new Error(`Scenario "${scenario.id}" is marked as expect_failure but the parser accepted it`);
    }

    await runValidation();
  }
}
