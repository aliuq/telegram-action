import * as p from "@clack/prompts";
import { cac } from "cac";
import type { CliOptions, ScenarioDefinition, TestHistoryState, TestMode, TestSelection } from "../../src/types.ts";
import { findScenarioById } from "../scenarios/index.ts";

/**
 * Parse CLI flags and normalize the runner options.
 */
export function parseCliOptions(argv: string[]): CliOptions {
  const normalizedArgv = argv.filter((arg) => arg !== "--");
  const cli = cac("test");

  cli
    .usage("[scenario-id ...] [options]")
    .option("-m, --mode <mode>", "Runner mode: source, act, or validate")
    .option("-a, --all", "Run the full scenario catalog")
    .option("-l, --last", "Rerun the last saved command from .test-history/test-history.json")
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

  const selectedScenarioIds = await p.autocompleteMultiselect({
    message: "Choose the scenarios to run",
    required: true,
    initialValues: [],
    options: allScenarios.map((scenario, index) => ({
      value: scenario.id,
      label: `${index + 1}. ${scenario.id}`,
      hint: [scenario.description, scenario.expect_failure ? "expected failure" : undefined]
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
export async function resolveSelection(
  allScenarios: ScenarioDefinition[],
  cli: CliOptions,
  history: TestHistoryState,
): Promise<TestSelection> {
  if (cli.rerunLast) {
    if (!history.lastRun) {
      throw new Error("No previous command found in .test-history/test-history.json");
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
export function resolveScenarios(allScenarios: ScenarioDefinition[], selection: TestSelection): ScenarioDefinition[] {
  if (selection.runAll) {
    return allScenarios;
  }

  return selection.scenarioIds.map((scenarioId) => findScenarioById(allScenarios, scenarioId));
}
