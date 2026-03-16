import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { cac } from "cac";
import { formatActErrorDetails, formatActRequestSummary } from "../src/act-logging.ts";
import { ATTACHMENT_METHOD_NAMES } from "../src/constants.ts";
import { getRequiredEnv } from "../src/env.ts";
import { parseActionInputs } from "../src/inputs.ts";
import { sendTelegramMessage } from "../src/telegram.ts";
import type {
  CliOptions,
  RawActionInputs,
  ScenarioDefinition,
  TestHistoryEntry,
  TestHistoryState,
  TestMode,
  TestSelection,
} from "../src/types.ts";
import { findScenarioById, loadScenarios } from "./scenarios/index";

const ROOT = new URL("..", import.meta.url).pathname;
const SECRET_FILE_PATH = resolve(ROOT, ".env");
const HISTORY_DIR = resolve(ROOT, ".history");
const LOG_DIR = resolve(HISTORY_DIR, "logs");
const HISTORY_FILE_PATH = resolve(HISTORY_DIR, "test-history.json");
const TEST_BOT_TOKEN = "test-bot-token";
const TEST_CHAT_ID = "123456";
const TEST_REPLY_TO_MESSAGE_ID = "42";
const RUNNER_BANNER = [
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
function printBanner(): void {
  console.log(RUNNER_BANNER.join("\n"));
}

/**
 * Ensure the local history and log directories exist before reading or writing state.
 */
function ensureHistoryDirs(): void {
  mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Load the runner's saved history state from disk.
 */
function loadHistoryState(): TestHistoryState {
  ensureHistoryDirs();
  if (!existsSync(HISTORY_FILE_PATH)) {
    return { runs: [] };
  }

  return JSON.parse(readFileSync(HISTORY_FILE_PATH, "utf8")) as TestHistoryState;
}

/**
 * Persist the latest run so the interactive runner can offer quick reruns.
 */
function saveHistoryEntry(entry: TestHistoryEntry): void {
  const state = loadHistoryState();
  const runs = [entry, ...state.runs].slice(0, 20);
  writeFileSync(HISTORY_FILE_PATH, JSON.stringify({ lastRun: entry, runs }, null, 2));
}

/**
 * Build the raw action input payload for a scenario in source, validate, or act mode.
 */
function buildRawActionInputs(scenario: ScenarioDefinition, useRealEnv: boolean): RawActionInputs {
  return {
    scenarioId: scenario.id,
    botToken: useRealEnv ? getRequiredEnv("TELEGRAM_BOT_TOKEN") : TEST_BOT_TOKEN,
    chatId: useRealEnv ? getRequiredEnv("TELEGRAM_CHAT_ID") : TEST_CHAT_ID,
    message: scenario.inputs.message,
    buttons: scenario.inputs.buttons,
    replyToMessageId: scenario.inputs.reply_to_message_id
      ? useRealEnv
        ? getRequiredEnv("TELEGRAM_REPLY_TO_MESSAGE_ID")
        : TEST_REPLY_TO_MESSAGE_ID
      : "",
    disableLinkPreview: scenario.inputs.disable_link_preview,
    attachment: scenario.inputs.attachment,
    attachmentType: scenario.inputs.attachment_type,
    attachmentFilename: scenario.inputs.attachment_filename,
  };
}

/**
 * Fail fast when two scenarios would share the same id.
 */
function assertUniqueScenarioIds(scenarios: ScenarioDefinition[]): void {
  const seen = new Set<string>();

  for (const scenario of scenarios) {
    if (seen.has(scenario.id)) {
      throw new Error(`Duplicate scenario id: ${scenario.id}`);
    }

    seen.add(scenario.id);
  }
}

/**
 * Validate the scenario catalog against the shared action parser.
 */
function validateScenarioCatalog(scenarios: ScenarioDefinition[]): void {
  assertUniqueScenarioIds(scenarios);

  for (const scenario of scenarios) {
    const runValidation = () => parseActionInputs(buildRawActionInputs(scenario, false));

    if (scenario.expect_failure) {
      try {
        runValidation();
      } catch {
        continue;
      }

      throw new Error(`Scenario "${scenario.id}" is marked as expect_failure but the parser accepted it`);
    }

    runValidation();
  }
}

/**
 * Quote a shell argument for a copy-pasteable rerun command.
 */
function shellEscape(arg: string): string {
  if (/^[\w./:=,@-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\\''")}'`;
}

/**
 * Parse CLI flags and normalize the runner options.
 */
function parseCliOptions(argv: string[]): CliOptions {
  const normalizedArgv = argv.filter((arg) => arg !== "--");
  const cli = cac("test");

  cli
    .usage("[scenario-id ...] [options]")
    .option("-m, --mode <mode>", "Runner mode: source, act, or validate")
    .option("-a, --all", "Run the full scenario catalog")
    .option("-l, --last", "Rerun the last saved command from .history/test-history.json")
    .help()
    .example("bun scripts/test.ts")
    .example("bun scripts/test.ts --mode source video-as-document")
    .example("bun scripts/test.ts --mode act --all")
    .example("bun scripts/test.ts --mode validate buttons-flat")
    .example("bun scripts/test.ts --last");

  const parsed = cli.parse(["node", "test", ...normalizedArgv], { run: false });
  const modeValue = parsed.options.mode;

  if (modeValue && !["source", "act", "validate"].includes(modeValue)) {
    throw new Error(`Unknown mode: ${modeValue}`);
  }

  if (parsed.options.help) {
    process.exit(0);
  }

  return {
    mode: modeValue as TestMode | undefined,
    runAll: Boolean(parsed.options.all),
    rerunLast: Boolean(parsed.options.last),
    scenarioIds: parsed.args.map((arg) => arg.trim()).filter(Boolean),
  };
}

/**
 * Reconstruct the runner command for history and rerun hints.
 */
function buildRunnerCommand(selection: TestSelection): string {
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
function createLogFilePath(selection: TestSelection): string {
  ensureHistoryDirs();
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const label = selection.runAll ? "all" : selection.scenarioIds.join("-");
  return resolve(LOG_DIR, `${timestamp}-${selection.mode}-${label || "interactive"}.log`);
}

/**
 * Prompt for the execution mode when it was not provided on the CLI.
 */
async function promptMode(history: TestHistoryState): Promise<TestMode | "last"> {
  const options = [
    {
      value: "source",
      label: "Source environment (Recommended)",
      hint: "Run src logic directly with the current workspace",
    },
    { value: "act", label: "act environment", hint: "Run the GitHub Actions workflow locally through act" },
    { value: "validate", label: "Validate only", hint: "Validate the scenario catalog without sending messages" },
  ];

  if (history.lastRun) {
    options.unshift({
      value: "last",
      label: "Run last command",
      hint: history.lastRun.command,
    });
  }

  const mode = await p.select({
    message: "Which environment would you like to run?",
    initialValue: history.lastRun ? "last" : "source",
    options,
  });

  if (p.isCancel(mode)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  return mode as TestMode | "last";
}

/**
 * Prompt for either a manual scenario subset or the full catalog.
 */
async function promptScenarioSelection(allScenarios: ScenarioDefinition[], mode: TestMode): Promise<TestSelection> {
  const selectionMode = await p.select({
    message: "How would you like to select scenarios?",
    initialValue: "manual",
    options: [
      { value: "manual", label: "Choose scenarios manually", hint: `Pick one or more scenarios for ${mode}` },
      { value: "all", label: "Select all scenarios", hint: "Run the full scenario catalog" },
    ],
  });

  if (p.isCancel(selectionMode)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  if (selectionMode === "all") {
    return { mode, runAll: true, scenarioIds: allScenarios.map((scenario) => scenario.id) };
  }

  const selectedScenarioIds = await p.multiselect({
    message: "Choose the scenarios to run",
    required: true,
    initialValues: [],
    options: allScenarios.map((scenario) => ({
      value: scenario.id,
      label: scenario.id,
      hint: [
        scenario.description,
        scenario.inputs.reply_to_message_id ? "requires reply target id" : undefined,
        scenario.expect_failure ? "expected failure" : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  });

  if (p.isCancel(selectedScenarioIds)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  return {
    mode,
    runAll: false,
    scenarioIds: selectedScenarioIds,
  };
}

/**
 * Resolve the final run selection from CLI flags, history, or interactive prompts.
 */
async function resolveSelection(
  allScenarios: ScenarioDefinition[],
  cli: CliOptions,
  history: TestHistoryState,
): Promise<TestSelection> {
  if (cli.rerunLast) {
    if (!history.lastRun) {
      throw new Error("No previous command found in .history/test-history.json");
    }

    return {
      mode: history.lastRun.mode,
      runAll: history.lastRun.runAll,
      scenarioIds: history.lastRun.scenarioIds,
    };
  }

  if (cli.mode) {
    if (cli.runAll) {
      return { mode: cli.mode, runAll: true, scenarioIds: allScenarios.map((scenario) => scenario.id) };
    }

    if (cli.scenarioIds.length > 0) {
      return { mode: cli.mode, runAll: false, scenarioIds: cli.scenarioIds };
    }

    if (!process.stdout.isTTY) {
      throw new Error("Interactive scenario selection requires a TTY. Pass scenario ids, --all, or --last.");
    }

    return promptScenarioSelection(allScenarios, cli.mode);
  }

  if (!process.stdout.isTTY) {
    throw new Error("Interactive selection requires a TTY. Pass --mode with scenario ids, --all, or --last.");
  }

  const promptedMode = await promptMode(history);
  if (promptedMode === "last") {
    if (!history.lastRun) {
      throw new Error("No previous command found in history");
    }

    return {
      mode: history.lastRun.mode,
      runAll: history.lastRun.runAll,
      scenarioIds: history.lastRun.scenarioIds,
    };
  }

  return promptScenarioSelection(allScenarios, promptedMode);
}

/**
 * Map the selected ids back to the full scenario objects.
 */
function resolveScenarios(allScenarios: ScenarioDefinition[], selection: TestSelection): ScenarioDefinition[] {
  if (selection.runAll) {
    return allScenarios;
  }

  return selection.scenarioIds.map((scenarioId) => findScenarioById(allScenarios, scenarioId));
}

/**
 * Ensure act mode has a repository-root secret file to read from.
 */
function ensureSecretFileExists(): void {
  if (!existsSync(SECRET_FILE_PATH)) {
    throw new Error(
      "Missing .env file in the repository root. Create it with TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and TELEGRAM_REPLY_TO_MESSAGE_ID before running act mode.",
    );
  }
}

/**
 * Build the act CLI arguments for the integration workflow.
 */
function buildActArgs(selection: TestSelection): string[] {
  return [
    "workflow_dispatch",
    "-W",
    resolve(ROOT, ".github/workflows/test.yaml"),
    "-j",
    "notification",
    "-C",
    ROOT,
    "--action-offline-mode",
    "--pull=false",
    "--secret-file",
    ".env",
    "--input",
    `scenario_ids=${selection.runAll ? "all" : selection.scenarioIds.join(",")}`,
  ];
}

/**
 * Format the act invocation as a shell command for prompts and logs.
 */
function formatActCommand(selection: TestSelection): string {
  return ["act", ...buildActArgs(selection)].map((arg) => shellEscape(arg)).join(" ");
}

/**
 * Run the selected scenarios through the local GitHub Actions workflow via act.
 */
async function runActSelection(selection: TestSelection, logFilePath: string): Promise<void> {
  ensureSecretFileExists();
  const actCommand = formatActCommand(selection);
  const logStream = createWriteStream(logFilePath, { flags: "a" });
  p.note(actCommand, "Command to execute");

  const shouldRun = await p.confirm({
    message: selection.runAll
      ? "Run all workflow scenarios with act now?"
      : `Run selected workflow scenarios with act: ${selection.scenarioIds.join(", ")}?`,
    initialValue: true,
  });

  if (p.isCancel(shouldRun) || !shouldRun) {
    p.cancel("Cancelled before execution");
    process.exit(0);
  }

  const scriptArgs = ["-qefc", actCommand, "/dev/null"];
  const child = spawn("script", scriptArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      CLICOLOR_FORCE: "1",
      TERM: process.env.TERM || "xterm-256color",
    },
  });

  let sawOutput = false;
  child.stdout?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    sawOutput = true;
    process.stdout.write(chunk);
    logStream.write(chunk);
  });
  child.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    sawOutput = true;
    process.stderr.write(chunk);
    logStream.write(chunk);
  });

  const exitCode = await new Promise<number>((resolveExitCode, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolveExitCode(code ?? 1));
  });
  logStream.end();

  if (!sawOutput) {
    p.log.error("act exited without output");
  }

  if (exitCode !== 0) {
    throw new Error(`act exited with code ${exitCode}`);
  }
}

/**
 * Run scenarios directly against the source implementation without invoking act.
 */
async function runSourceSelection(scenarios: ScenarioDefinition[], logFilePath: string): Promise<void> {
  const logLines: string[] = [];
  const previousActScenarioId = process.env.ACT_SCENARIO_ID;

  delete process.env.ACT_SCENARIO_ID;

  try {
    for (const scenario of scenarios) {
      const request = parseActionInputs(buildRawActionInputs(scenario, true));
      const requestSummary = formatActRequestSummary({
        scenarioId: request.scenarioId,
        method: request.attachmentType ? ATTACHMENT_METHOD_NAMES[request.attachmentType] : "sendMessage",
        chatId: request.chatId,
        message: request.message,
        disableLinkPreview: request.disableLinkPreview,
        replyMessageId: request.replyMessageId,
        replyMarkup: request.replyMarkup,
        attachmentType: request.attachmentType,
        attachmentSource: request.attachmentSource,
      });
      p.note(requestSummary, `[source] Send preview (${scenario.id})`);
      logLines.push(`[debug:${scenario.id}]\n${requestSummary}`);

      if (scenario.expect_failure) {
        try {
          await sendTelegramMessage(request);
        } catch (error) {
          const details = formatActErrorDetails(error);
          p.note(details, `[source] Send failure details (${scenario.id})`);
          logLines.push(`[debug:${scenario.id}]\n${details}`);
          const message = `[expected failure] ${scenario.id}: ${error instanceof Error ? error.message : String(error)}`;
          p.log.step(message);
          logLines.push(message);
          continue;
        }

        throw new Error(`Scenario "${scenario.id}" is marked as expect_failure but completed successfully`);
      }

      const result = await sendTelegramMessage(request);
      const message = `Sent scenario "${scenario.id}" (message_id=${result.message_id})`;
      p.log.success(message);
      logLines.push(message);
    }
  } finally {
    if (previousActScenarioId === undefined) {
      delete process.env.ACT_SCENARIO_ID;
    } else {
      process.env.ACT_SCENARIO_ID = previousActScenarioId;
    }
  }

  writeFileSync(logFilePath, `${logLines.join("\n")}\n`);
}

/**
 * Validate scenarios locally without sending any Telegram requests.
 */
function runValidationSelection(scenarios: ScenarioDefinition[], logFilePath: string): void {
  const logLines: string[] = [];

  for (const scenario of scenarios) {
    const runValidation = () => parseActionInputs(buildRawActionInputs(scenario, false));

    if (scenario.expect_failure) {
      try {
        runValidation();
      } catch (error) {
        const message = `[expected failure] ${scenario.id}: ${error instanceof Error ? error.message : String(error)}`;
        p.log.step(message);
        logLines.push(message);
        continue;
      }

      throw new Error(`Scenario "${scenario.id}" is marked as expect_failure but the parser accepted it`);
    }

    runValidation();
    const message = `Validated scenario "${scenario.id}" against the action parser`;
    p.log.success(message);
    logLines.push(message);
  }

  writeFileSync(logFilePath, `${logLines.join("\n")}\n`);
}

/**
 * Entry point for the interactive local runner.
 */
async function main(): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));

  printBanner();

  const allScenarios = await loadScenarios();
  validateScenarioCatalog(allScenarios);
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
    runValidationSelection(scenarios, logFilePath);
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
