import { findScenarioById, loadScenarios, resolveScenarioSelection } from "./scenario-utils.mjs";

/**
 * Decide whether the current matrix entry should run and, if so, expose all
 * scenario fields as step outputs for the workflow.
 */
export async function selectAndLoadScenario({ core, scenarioIds, scenarioId }) {
  if (!scenarioId) {
    throw new Error("scenarioId is required");
  }

  const scenarios = await loadScenarios();
  const selection = resolveScenarioSelection(scenarios, scenarioIds);
  const shouldRun = selection.runAll || selection.scenarioIds.includes(scenarioId);
  core.setOutput("should_run", shouldRun ? "true" : "false");

  if (!shouldRun) {
    return;
  }

  const scenario = findScenarioById(scenarios, scenarioId);

  core.setOutput("message", scenario.inputs.message ?? "");
  core.setOutput("disable_link_preview", scenario.inputs.disable_link_preview ?? "true");
  core.setOutput("buttons", scenario.inputs.buttons ?? "");
  core.setOutput("attachment", scenario.inputs.attachment ?? "");
  core.setOutput("attachment_type", scenario.inputs.attachment_type ?? "");
  core.setOutput("attachment_filename", scenario.inputs.attachment_filename ?? "");
  core.setOutput("requires_group", String(Boolean(scenario.requires_group)));
  core.setOutput("expect_failure", String(Boolean(scenario.expect_failure)));
}
