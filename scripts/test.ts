import * as p from "@clack/prompts";
import type { TestHistoryEntry } from "../src/types.ts";
import { loadScenarios } from "./scenarios/index.ts";
import { parseCliOptions, resolveScenarios, resolveSelection } from "./test-support/cli.ts";
import { runActSelection, runSourceSelection, runValidationSelection } from "./test-support/execution.ts";
import { buildRunnerCommand, createLogFilePath, loadHistoryState, saveHistoryEntry } from "./test-support/history.ts";
import { printBanner, TEST_MESSAGE_URL_OVERRIDES_JSON, validateScenarioCatalog } from "./test-support/shared.ts";

/**
 * Entry point for the interactive local runner.
 */
async function main(): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));

  process.env.TELEGRAM_ACTION_TEST_MESSAGE_URL_OVERRIDES = TEST_MESSAGE_URL_OVERRIDES_JSON;

  printBanner();

  const allScenarios = await loadScenarios();
  await validateScenarioCatalog(allScenarios);
  const history = loadHistoryState();
  const selection = await resolveSelection(allScenarios, cli, history);
  const scenarios = resolveScenarios(allScenarios, selection);
  const logFilePath = createLogFilePath(selection);

  if (scenarios.some((scenario) => Boolean(scenario.inputs.reply_to_message_id))) {
    p.log.info("Some selected scenarios require TELEGRAM_REPLY_TO_MESSAGE_ID.");
  }

  if (selection.mode === "source") {
    await runSourceSelection(scenarios, logFilePath);
  } else if (selection.mode === "act") {
    await runActSelection(selection, logFilePath);
  } else {
    await runValidationSelection(scenarios, logFilePath);
  }

  const historyEntry: TestHistoryEntry = {
    ...selection,
    command: buildRunnerCommand(selection),
    createdAt: new Date().toISOString(),
    logFile: logFilePath,
  };
  saveHistoryEntry(historyEntry);

  p.note(historyEntry.command, "Rerun command");
  p.note(logFilePath, "Saved log");
  p.outro(
    selection.runAll
      ? `✅  Completed ${scenarios.length} scenarios in ${selection.mode} mode`
      : `✅  Completed ${scenarios.map((scenario) => scenario.id).join(", ")} in ${selection.mode} mode`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
