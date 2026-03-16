import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { TestHistoryEntry, TestHistoryState, TestSelection } from "../../src/types.ts";
import { HISTORY_FILE_PATH, LOG_DIR } from "./shared.ts";

/**
 * Ensure the local history and log directories exist before reading or writing state.
 */
export function ensureHistoryDirs(): void {
  mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Load the runner's saved history state from disk.
 */
export function loadHistoryState(): TestHistoryState {
  ensureHistoryDirs();
  if (!existsSync(HISTORY_FILE_PATH)) {
    return { runs: [] };
  }

  return JSON.parse(readFileSync(HISTORY_FILE_PATH, "utf8")) as TestHistoryState;
}

/**
 * Persist the latest run so the interactive runner can offer quick reruns.
 */
export function saveHistoryEntry(entry: TestHistoryEntry): void {
  const state = loadHistoryState();
  const runs = [entry, ...state.runs].slice(0, 20);
  writeFileSync(HISTORY_FILE_PATH, JSON.stringify({ lastRun: entry, runs }, null, 2));
}

/**
 * Quote a shell argument for a copy-pasteable rerun command.
 */
export function shellEscape(arg: string): string {
  if (/^[\w./:=,@-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\\''")}'`;
}

/**
 * Reconstruct the runner command for history and rerun hints.
 */
export function buildRunnerCommand(selection: TestSelection): string {
  const args = ["bun", "scripts/test.ts", "--mode", selection.mode];
  if (selection.runAll) {
    args.push("--all");
  } else {
    args.push(...selection.scenarioIds);
  }

  return args.map(shellEscape).join(" ");
}

/**
 * Create a timestamped log path for the current run.
 */
export function createLogFilePath(selection: TestSelection): string {
  ensureHistoryDirs();
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const label = selection.runAll ? "all" : selection.scenarioIds.join("-");
  return `${LOG_DIR}/${timestamp}-${selection.mode}-${label || "interactive"}.log`;
}
