import type { ScenarioDefinition, ScenarioSelection, WorkflowScenarioMatrix } from "../../src/types.ts";
import { createButtonScenarios } from "./buttons.ts";
import { createDocumentScenarios } from "./documents.ts";
import { createFailureScenarios } from "./failures.ts";
import { createMessageScenarios } from "./messages.ts";
import { createPhotoScenarios } from "./photos.ts";
import { createReplyScenarios } from "./replies.ts";
import { createVideoScenarios } from "./videos.ts";

/**
 * Assemble the full scenario catalog in the order used by local and CI tooling.
 */
export function buildScenarioCatalog(): ScenarioDefinition[] {
  return [
    ...createMessageScenarios(),
    ...createButtonScenarios(),
    ...createPhotoScenarios(),
    ...createVideoScenarios(),
    ...createDocumentScenarios(),
    ...createReplyScenarios(),
    ...createFailureScenarios(),
  ];
}

/**
 * Load scenarios and fail fast when duplicate ids would make selection ambiguous.
 */
export async function loadScenarios(): Promise<ScenarioDefinition[]> {
  const scenarios = buildScenarioCatalog();
  const seenScenarioIds = new Set<string>();

  for (const scenario of scenarios) {
    if (seenScenarioIds.has(scenario.id)) {
      throw new Error(`Duplicate scenario id: ${scenario.id}`);
    }

    seenScenarioIds.add(scenario.id);
  }

  return scenarios;
}

/**
 * Resolve a single scenario id into its definition.
 */
export function findScenarioById(scenarios: ScenarioDefinition[], scenarioId: string): ScenarioDefinition {
  const scenario = scenarios.find((entry) => entry.id === scenarioId);

  if (!scenario) {
    throw new Error(`Unknown scenario id: ${scenarioId}`);
  }

  return scenario;
}

/**
 * Parse comma-separated workflow input into a normalized selection object.
 */
export function parseScenarioIds(input?: string | null): { runAll: boolean; scenarioIds: string[] } {
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
 * Convert a raw scenario selection string into concrete scenario definitions.
 */
export function resolveScenarioSelection(scenarios: ScenarioDefinition[], input?: string | null): ScenarioSelection {
  const parsedSelection = parseScenarioIds(input);

  if (parsedSelection.runAll) {
    return {
      runAll: true,
      scenarioIds: scenarios.map((scenario) => scenario.id),
      selectedScenarios: scenarios,
    };
  }

  const selectedScenarios: ScenarioDefinition[] = [];
  const unknownIds: string[] = [];

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
    scenarioIds: selectedScenarios.map((scenario) => scenario.id),
    selectedScenarios,
  };
}

/**
 * Build the GitHub Actions matrix format expected by the integration workflow.
 */
export function buildWorkflowScenarioMatrix(selection: ScenarioSelection): WorkflowScenarioMatrix {
  return {
    include: selection.selectedScenarios.map((scenario) => ({ scenario_id: scenario.id })),
  };
}
