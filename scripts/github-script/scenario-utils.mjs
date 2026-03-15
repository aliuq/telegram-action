import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL("../..", import.meta.url).pathname;
const scenariosPath = resolve(root, "scripts/scenarios.json");

/**
 * Load the shared integration scenario catalog from disk.
 */
export async function loadScenarios() {
  const rawScenarios = await readFile(scenariosPath, "utf8");
  return JSON.parse(rawScenarios);
}

/**
 * Look up a scenario by id and throw when the catalog does not contain it.
 */
export function findScenarioById(scenarios, scenarioId) {
  const scenario = scenarios.find((entry) => entry.id === scenarioId);

  if (!scenario) {
    throw new Error(`Unknown scenario id: ${scenarioId}`);
  }

  return scenario;
}

/**
 * Parse the workflow input into either "run all" mode or an explicit id list.
 */
export function parseScenarioIds(input) {
  const normalizedInput = (input ?? "all").trim().toLowerCase();
  if (normalizedInput === "" || normalizedInput === "all") {
    return { runAll: true, scenarioIds: [] };
  }

  return {
    runAll: false,
    scenarioIds: normalizedInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

/**
 * Resolve the final selection and reject unknown ids early so the workflow and
 * interactive runner share the same validation rules.
 */
export function resolveScenarioSelection(scenarios, input) {
  const parsedSelection = parseScenarioIds(input);

  if (parsedSelection.runAll) {
    return {
      runAll: true,
      scenarioIds: ["all"],
      selectedScenarios: scenarios,
    };
  }

  const selectedScenarios = [];
  const unknownIds = [];

  for (const scenarioId of parsedSelection.scenarioIds) {
    const scenario = scenarios.find((entry) => entry.id === scenarioId);
    if (!scenario) {
      unknownIds.push(scenarioId);
      continue;
    }

    if (!selectedScenarios.some((entry) => entry.id === scenario.id)) {
      selectedScenarios.push(scenario);
    }
  }

  if (unknownIds.length > 0) {
    throw new Error(`Unknown scenario ids: ${unknownIds.join(", ")}`);
  }

  return {
    runAll: false,
    scenarioIds: parsedSelection.scenarioIds,
    selectedScenarios,
  };
}
