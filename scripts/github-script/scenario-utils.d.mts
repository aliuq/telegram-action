export interface ScenarioInputs {
  message: string;
  disable_link_preview: string;
  buttons: string;
  attachment: string;
  attachment_type: string;
  attachment_filename: string;
}

export interface ScenarioDefinition {
  id: string;
  description: string;
  requires_group: boolean;
  expect_failure: boolean;
  inputs: ScenarioInputs;
}

export interface ScenarioSelection {
  runAll: boolean;
  scenarioIds: string[];
  selectedScenarios: ScenarioDefinition[];
}

export function loadScenarios(): Promise<ScenarioDefinition[]>;
export function findScenarioById(scenarios: ScenarioDefinition[], scenarioId: string): ScenarioDefinition;
export function parseScenarioIds(input?: string | null): {
  runAll: boolean;
  scenarioIds: string[];
};
export function resolveScenarioSelection(scenarios: ScenarioDefinition[], input?: string | null): ScenarioSelection;
