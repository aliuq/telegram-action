import { logger } from '../src/logger.ts';
import type { TestHistoryEntry } from '../src/types.ts';
import { loadScenarios } from './scenarios/index.ts';
import { parseCliOptions, resolveScenarios, resolveSelection } from './test-support/cli.ts';
import {
  runActSelection,
  runSourceSelection,
  runValidationSelection,
} from './test-support/execution.ts';
import {
  buildRunnerCommand,
  createLogFilePath,
  loadHistoryState,
  saveHistoryEntry,
} from './test-support/history.ts';
import { showNote, showOutro } from './test-support/output.ts';
import { printBanner, validateScenarioCatalog } from './test-support/shared.ts';

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

/** Main entry point for the local runner. */
async function main(runStartedAt: number): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));

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

  // Save the rerun command up front so a failed run can be repeated quickly.
  saveHistoryEntry(historyEntry);

  try {
    if (selection.mode === 'source') {
      await runSourceSelection(scenarios, logFilePath);
    } else if (selection.mode === 'act') {
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
  showNote(historyEntry.command, 'Rerun command');
  showNote(logFilePath, 'Saved log');
  showOutro(
    selection.runAll
      ? `✅  Completed ${scenarios.length} scenarios in ${selection.mode} mode in ${duration}`
      : `✅  Completed ${scenarios.map((scenario) => scenario.id).join(', ')} in ${selection.mode} mode in ${duration}`,
  );
}

const runStartedAt = Date.now();

void main(runStartedAt).catch((error) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  showOutro(`❌  Failed after ${formatDuration(Date.now() - runStartedAt)}`);
  process.exit(1);
});
