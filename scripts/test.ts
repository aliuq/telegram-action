/**
 * Interactive test runner for telegram-action.
 * Run with: bun run test:interactive
 *
 * This runner reuses `.github/workflows/run.yaml` and drives it through `act`.
 * Test scenarios live in `scripts/scenarios.json`, so adding a new scenario only
 * requires updating the shared scenario catalog instead of expanding the workflow.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { loadScenarios } from "./github-script/scenario-utils.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/run.yaml");
const SECRET_FILE_PATH = resolve(ROOT, ".env");

interface ScenarioInputs {
  message: string;
  disable_link_preview: string;
  buttons: string;
  attachment: string;
  attachment_type: string;
  attachment_filename: string;
}

interface TestScenario {
  id: string;
  description: string;
  requires_group: boolean;
  expect_failure: boolean;
  inputs: ScenarioInputs;
}

/**
 * Ensure the local `act` run can load secrets from the repository `.env` file.
 */
function ensureSecretFileExists(): void {
  if (!existsSync(SECRET_FILE_PATH)) {
    throw new Error(
      "Missing .env file in the repository root. Create it with TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_CHAT_ID_GROUP, and TELEGRAM_REPLY_TO_MESSAGE_ID before running the interactive test runner.",
    );
  }
}

/**
 * Build the act command arguments for the selected scenarios.
 */
function buildActArgs(options: { scenarioIds: string[]; runAll: boolean }): string[] {
  const actArgs = [
    "workflow_dispatch",
    "-W",
    WORKFLOW_PATH,
    "-j",
    "notification",
    "-C",
    ROOT,
    "--secret-file",
    ".env",
    "--input",
    `scenario_ids=${options.runAll ? "all" : options.scenarioIds.join(",")}`,
  ];

  if (!options.runAll) {
    for (const scenarioId of options.scenarioIds) {
      actArgs.push("--matrix", `scenario_id:${scenarioId}`);
    }
  }

  return actArgs;
}

/**
 * Convert the argument list into a printable shell command for confirmation.
 */
function shellEscape(arg: string): string {
  if (/^[\w./:=,-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\\''")}'`;
}

/**
 * Convert the argument list into a printable shell command for confirmation.
 */
function formatActCommand(actArgs: string[]): string {
  return ["act", ...actArgs].map((arg) => shellEscape(arg)).join(" ");
}

/**
 * Execute the reusable workflow through act, forwarding the selected scenario
 * ids while letting act load secrets from the repository `.env` file.
 */
async function runWorkflow(options: {
  scenarioIds: string[];
  runAll: boolean;
}): Promise<{ code: number; out: string }> {
  const actArgs = buildActArgs(options);

  const child = spawn("act", actArgs, { cwd: ROOT });

  let out = "";
  child.stdout?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    out += chunk;
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    out += chunk;
    process.stderr.write(chunk);
  });

  const code = await new Promise<number>((resolveExitCode) => {
    child.on("close", (exitCode) => resolveExitCode(exitCode ?? 1));
  });

  return { code, out: out.trim() };
}

/**
 * Let users browse and pick scenarios without memorizing ids or typing commas.
 * Manual selection now starts empty, while a dedicated shortcut keeps "select all"
 * available for the cases where the full catalog should run.
 */
async function promptScenarioSelection(scenarios: TestScenario[]): Promise<TestScenario[]> {
  const selectionMode = await p.select({
    message: "How would you like to select scenarios?",
    initialValue: "manual",
    options: [
      {
        value: "manual",
        label: "Choose scenarios manually",
        hint: "Starts with no scenarios selected",
      },
      {
        value: "all",
        label: "Select all scenarios",
        hint: "Run the full scenario catalog",
      },
    ],
  });

  if (p.isCancel(selectionMode)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  if (selectionMode === "all") {
    return scenarios;
  }

  const selectedScenarioIds = await p.multiselect({
    message: "Choose the scenarios to run",
    required: true,
    initialValues: [],
    options: scenarios.map((scenario) => ({
      value: scenario.id,
      label: scenario.id,
      hint: [
        scenario.description,
        scenario.requires_group ? "requires group secrets" : undefined,
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

  return scenarios.filter((scenario) => selectedScenarioIds.includes(scenario.id));
}

/**
 * Gather user input, validate the selected scenarios, and run the reusable
 * workflow through act.
 */
async function main() {
  p.intro("📨  Telegram Action — Interactive act runner");
  ensureSecretFileExists();

  const scenarios: TestScenario[] = await loadScenarios();

  const selectedScenarios = await promptScenarioSelection(scenarios);
  const scenarioIds = selectedScenarios.map((scenario) => scenario.id);
  const selectedAllScenarios = selectedScenarios.length === scenarios.length;

  const requiresGroupSecrets = selectedScenarios.some((scenario) => scenario.requires_group);
  if (requiresGroupSecrets) {
    p.log.info("Selected scenarios require TELEGRAM_CHAT_ID_GROUP and TELEGRAM_REPLY_TO_MESSAGE_ID in .env");
  }

  const actCommand = formatActCommand(
    buildActArgs({
      scenarioIds,
      runAll: selectedAllScenarios,
    }),
  );
  p.note(actCommand, "Command to execute");

  const shouldRun = await p.confirm({
    message: "Run this act command now?",
    initialValue: true,
  });
  if (p.isCancel(shouldRun) || !shouldRun) {
    p.cancel("Cancelled before execution");
    process.exit(0);
  }

  p.log.step(
    selectedAllScenarios
      ? "Running all workflow scenarios with act"
      : `Running selected workflow scenarios with act: ${scenarioIds.join(", ")}`,
  );

  const { code, out } = await runWorkflow({
    scenarioIds,
    runAll: selectedAllScenarios,
  });

  if (code === 0) {
    p.outro("✅  Workflow executed successfully through act");
  } else {
    if (!out) {
      p.log.error("act exited without output");
    }
    p.outro("❌  Workflow failed through act");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
