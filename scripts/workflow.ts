import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getRequiredEnv } from "../src/env.ts";
import {
  buildWorkflowScenarioMatrix,
  findScenarioById,
  loadScenarios,
  resolveScenarioSelection,
} from "./scenarios/index.ts";

/**
 * Write a multiline-safe GitHub Actions output value.
 */
function writeOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT environment variable is required");
  }

  const delimiter = `EOF_${name.toUpperCase()}_${Math.random().toString(36).slice(2)}`;
  appendFileSync(outputPath, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

const ACTION_INPUT_NAMES = [
  "message",
  "message_file",
  "message_url",
  "stream_response",
  "buttons",
  "disable_link_preview",
  "attachment",
  "attachments",
  "attachment_type",
  "attachment_filename",
  "supports_streaming",
] as const;

function createGitHubOutputFile(prefix: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "telegram-action-"));
  const outputFilePath = join(tempDir, `${prefix}.txt`);
  writeFileSync(outputFilePath, "");
  return outputFilePath;
}

function cleanupGitHubOutputFile(outputFilePath: string): void {
  rmSync(dirname(outputFilePath), { recursive: true, force: true });
}

function parseGitHubOutputFile(outputFilePath: string): Record<string, string> {
  const content = readFileSync(outputFilePath, "utf8");
  const outputs: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    const multilineMatch = line.match(/^([^<]+)<<(.+)$/);
    if (multilineMatch) {
      const [, name, delimiter] = multilineMatch;
      const valueLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== delimiter) {
        valueLines.push(lines[index]);
        index += 1;
      }
      outputs[name] = valueLines.join("\n");
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex !== -1) {
      outputs[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
    }
  }

  return outputs;
}

function shellEscape(arg: string): string {
  if (/^[\w./:=,@-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\\''")}'`;
}

async function runLoggedCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  console.info(`$ ${[command, ...args].map((arg) => shellEscape(arg)).join(" ")}`);

  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  return await new Promise<number>((resolveExitCode, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolveExitCode(code ?? 1));
  });
}

/**
 * Emit the scenario matrix for the integration workflow.
 */
async function writeMatrix(): Promise<void> {
  const scenarios = await loadScenarios();
  const selection = resolveScenarioSelection(scenarios, process.env.SCENARIO_IDS);
  const matrix = buildWorkflowScenarioMatrix(selection);

  writeOutput("matrix", JSON.stringify(matrix));
}

/**
 * Emit the selected scenario's inputs as workflow outputs.
 */
async function writeScenarioOutputs(): Promise<void> {
  const scenarioId = getRequiredEnv("SCENARIO_ID");
  const scenarios = await loadScenarios();
  const scenario = findScenarioById(scenarios, scenarioId);

  writeOutput("message", scenario.inputs.message ?? "");
  writeOutput("message_file", scenario.inputs.message_file ?? "");
  writeOutput("message_url", scenario.inputs.message_url ?? "");
  writeOutput("stream_response", scenario.inputs.stream_response ?? "false");
  writeOutput("disable_link_preview", scenario.inputs.disable_link_preview ?? "true");
  writeOutput("buttons", scenario.inputs.buttons ?? "");
  writeOutput("attachment", scenario.inputs.attachment ?? "");
  writeOutput("attachments", scenario.inputs.attachments ?? "");
  writeOutput("attachment_type", scenario.inputs.attachment_type ?? "");
  writeOutput("attachment_filename", scenario.inputs.attachment_filename ?? "");
  writeOutput("supports_streaming", scenario.inputs.supports_streaming ?? "false");
  writeOutput("expect_failure", String(Boolean(scenario.expect_failure)));
}

/**
 * Verify that the action outcome matches the scenario's expected pass/fail state.
 */
function assertScenarioOutcome(scenarioId: string, expectFailure: boolean, outcome: string): void {
  const expectedOutcome = expectFailure ? "failure" : "success";

  if (outcome !== expectedOutcome) {
    throw new Error(`Expected scenario '${scenarioId}' to ${expectedOutcome}, but got '${outcome}'.`);
  }

  console.info(`Scenario '${scenarioId}' finished with the expected outcome.`);
}

function assertScenarioOutcomeFromEnv(): void {
  assertScenarioOutcome(
    getRequiredEnv("SCENARIO_ID"),
    getRequiredEnv("EXPECT_FAILURE") === "true",
    getRequiredEnv("SCENARIO_OUTCOME"),
  );
}

async function runSelectedScenarios(): Promise<void> {
  const scenarios = await loadScenarios();
  const selection = resolveScenarioSelection(scenarios, process.env.SCENARIO_IDS);

  console.info(`Resolved ${selection.selectedScenarios.length} scenario(s).`);

  for (const scenario of selection.selectedScenarios) {
    console.log(`::group::Run scenario — ${scenario.id}`);
    const outputFilePath = createGitHubOutputFile(`action-${scenario.id}`);

    try {
      const actionEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ACT_SCENARIO_ID: scenario.id,
        GITHUB_OUTPUT: outputFilePath,
        TELEGRAM_ACTION_EXPECT_FAILURE: scenario.expect_failure ? "true" : "false",
      };

      for (const inputName of ACTION_INPUT_NAMES) {
        actionEnv[`INPUT_${inputName.toUpperCase()}`] = scenario.inputs[inputName] ?? "";
      }

      const exitCode = await runLoggedCommand("node", ["dist/index.js"], actionEnv);
      const outputs = parseGitHubOutputFile(outputFilePath);
      const outcome = exitCode === 0 ? "success" : "failure";

      assertScenarioOutcome(scenario.id, scenario.expect_failure, outcome);

      if (outcome === "success") {
        if (outputs.message_id) {
          console.info(`message_id=${outputs.message_id}`);
        }
        if (outputs.status) {
          console.info(`status=${outputs.status}`);
        }
      } else {
        console.info(`[expected failure] ${scenario.id}`);
      }
    } finally {
      cleanupGitHubOutputFile(outputFilePath);
      console.log("::endgroup::");
    }
  }
}

/**
 * Dispatch the requested workflow helper subcommand.
 */
async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === "matrix") {
    await writeMatrix();
    return;
  }

  if (command === "scenario") {
    await writeScenarioOutputs();
    return;
  }

  if (command === "run-selection") {
    await runSelectedScenarios();
    return;
  }

  if (command === "assert-outcome") {
    assertScenarioOutcomeFromEnv();
    return;
  }

  throw new Error(`Unknown workflow command: ${command ?? "<missing>"}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
