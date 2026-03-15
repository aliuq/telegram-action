import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const workflowPath = resolve(root, ".github/workflows/run.yaml");
const scenariosPath = resolve(root, "scripts/scenarios.json");

/**
 * Read the workflow matrix scenario ids from run.yaml.
 */
async function readWorkflowScenarioIds() {
  const workflow = await readFile(workflowPath, "utf8");
  const lines = workflow.split("\n");
  const scenarioIds = [];

  let insideScenarioMatrix = false;
  for (const line of lines) {
    if (!insideScenarioMatrix && /^\s*scenario_id:\s*$/.test(line)) {
      insideScenarioMatrix = true;
      continue;
    }

    if (!insideScenarioMatrix) {
      continue;
    }

    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (match) {
      scenarioIds.push(match[1]);
      continue;
    }

    if (line.trim() !== "" && !line.startsWith(" ".repeat(10))) {
      break;
    }
  }

  if (scenarioIds.length === 0) {
    throw new Error("Could not find any scenario_id entries in .github/workflows/run.yaml");
  }

  return scenarioIds;
}

/**
 * Read scenario ids from the shared scenario catalog.
 */
async function readCatalogScenarioIds() {
  const rawScenarios = await readFile(scenariosPath, "utf8");
  const scenarios = JSON.parse(rawScenarios);
  return scenarios.map((scenario) => scenario.id);
}

/**
 * Compare the workflow matrix ids against the shared scenario catalog.
 */
function assertScenarioSync(workflowIds, catalogIds) {
  const missingFromWorkflow = catalogIds.filter((id) => !workflowIds.includes(id));
  const missingFromCatalog = workflowIds.filter((id) => !catalogIds.includes(id));

  if (missingFromWorkflow.length === 0 && missingFromCatalog.length === 0) {
    return;
  }

  const messages = [];
  if (missingFromWorkflow.length > 0) {
    messages.push(`Missing from workflow matrix: ${missingFromWorkflow.join(", ")}`);
  }
  if (missingFromCatalog.length > 0) {
    messages.push(`Missing from scenario catalog: ${missingFromCatalog.join(", ")}`);
  }

  throw new Error(messages.join("\n"));
}

const workflowScenarioIds = await readWorkflowScenarioIds();
const catalogScenarioIds = await readCatalogScenarioIds();
assertScenarioSync(workflowScenarioIds, catalogScenarioIds);
