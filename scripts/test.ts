import * as p from "@clack/prompts";
import type { TestHistoryEntry } from "../src/types.ts";
import { loadScenarios } from "./scenarios/index.ts";
import { parseCliOptions, resolveScenarios, resolveSelection } from "./test-support/cli.ts";
import { runActSelection, runSourceSelection, runValidationSelection } from "./test-support/execution.ts";
import { buildRunnerCommand, createLogFilePath, loadHistoryState, saveHistoryEntry } from "./test-support/history.ts";
import { printBanner, TEST_MESSAGE_URL_OVERRIDES_JSON, validateScenarioCatalog } from "./test-support/shared.ts";

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const totalSeconds = Math.round(durationMs / 100) / 10;
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round((totalSeconds % 60) * 10) / 10;
  return `${minutes}m ${seconds}s`;
}

/**
 * Entry point for the interactive local runner.
 */
async function main(runStartedAt: number): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));

  process.env.TELEGRAM_ACTION_TEST_MESSAGE_URL_OVERRIDES = TEST_MESSAGE_URL_OVERRIDES_JSON;

  printBanner();

  const allScenarios = await loadScenarios();
  await validateScenarioCatalog(allScenarios);
  const history = loadHistoryState();
  const selection = await resolveSelection(allScenarios, cli, history);
  const scenarios = resolveScenarios(allScenarios, selection);
  const logFilePath = createLogFilePath(selection);
  const historyEntry: TestHistoryEntry = {
    ...selection,
    command: buildRunnerCommand(selection),
    createdAt: new Date().toISOString(),
    logFile: logFilePath,
  };

  // Persist the rerun command before execution starts so failed runs can be
  // resumed easily after fixing the underlying issue.
  saveHistoryEntry(historyEntry);

  try {
    if (selection.mode === "source") {
      await runSourceSelection(scenarios, logFilePath);
    } else if (selection.mode === "act") {
      await runActSelection(selection, logFilePath);
    } else {
      await runValidationSelection(scenarios, logFilePath);
    }
  } catch (error) {
    const durationMs = Date.now() - runStartedAt;
    saveHistoryEntry({
      ...historyEntry,
      durationMs,
      durationText: formatDuration(durationMs),
    });
    throw error;
  }

  const durationMs = Date.now() - runStartedAt;
  const duration = formatDuration(durationMs);
  saveHistoryEntry({
    ...historyEntry,
    durationMs,
    durationText: duration,
  });
  p.note(historyEntry.command, "Rerun command");
  p.note(logFilePath, "Saved log");
  p.note(duration, "Elapsed");
  p.outro(
    selection.runAll
      ? `✅  Completed ${scenarios.length} scenarios in ${selection.mode} mode in ${duration}`
      : `✅  Completed ${scenarios.map((scenario) => scenario.id).join(", ")} in ${selection.mode} mode in ${duration}`,
  );
}

const runStartedAt = Date.now();

void main(runStartedAt).catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  p.outro(`❌  Failed after ${formatDuration(Date.now() - runStartedAt)}`);
  process.exit(1);
});
