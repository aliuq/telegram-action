import { appendFileSync } from "node:fs";
import { getRequiredEnv } from "../src/env.ts";
import {
  buildWorkflowScenarioMatrix,
  findScenarioById,
  loadScenarios,
  resolveScenarioSelection,
} from "./scenarios/index.ts";
import { TEST_MESSAGE_URL_OVERRIDES } from "./scenarios/shared.ts";

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
  writeOutput("reply_to_message_id", scenario.inputs.reply_to_message_id ?? "");
  writeOutput("disable_link_preview", scenario.inputs.disable_link_preview ?? "true");
  writeOutput("buttons", scenario.inputs.buttons ?? "");
  writeOutput("attachment", scenario.inputs.attachment ?? "");
  writeOutput("attachments", scenario.inputs.attachments ?? "");
  writeOutput("attachment_type", scenario.inputs.attachment_type ?? "");
  writeOutput("attachment_filename", scenario.inputs.attachment_filename ?? "");
  writeOutput("supports_streaming", scenario.inputs.supports_streaming ?? "false");
  writeOutput("expect_failure", String(Boolean(scenario.expect_failure)));
  writeOutput("message_url_overrides", JSON.stringify(TEST_MESSAGE_URL_OVERRIDES));
}

/**
 * Verify that the action outcome matches the scenario's expected pass/fail state.
 */
function assertScenarioOutcome(): void {
  const scenarioId = getRequiredEnv("SCENARIO_ID");
  const expectFailure = getRequiredEnv("EXPECT_FAILURE") === "true";
  const outcome = getRequiredEnv("SCENARIO_OUTCOME");
  const expectedOutcome = expectFailure ? "failure" : "success";

  if (outcome !== expectedOutcome) {
    throw new Error(`Expected scenario '${scenarioId}' to ${expectedOutcome}, but got '${outcome}'.`);
  }

  console.info(`Scenario '${scenarioId}' finished with the expected outcome.`);
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

  if (command === "assert-outcome") {
    assertScenarioOutcome();
    return;
  }

  throw new Error(`Unknown workflow command: ${command ?? "<missing>"}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
