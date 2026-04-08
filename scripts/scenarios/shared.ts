import type { ScenarioDefinition, ScenarioInputs } from '../../src/types.ts';

/**
 * Build a scenario input payload from the shared defaults used across examples.
 */
export function createScenarioInputs(overrides: Partial<ScenarioInputs>): ScenarioInputs {
  return {
    message: '',
    message_file: '',
    message_url: '',
    disable_link_preview: 'true',
    buttons: '',
    attachment: '',
    attachments: '',
    attachment_type: '',
    attachment_filename: '',
    supports_streaming: 'false',
    exit_on_fail: 'true',
    ...overrides,
  };
}

/**
 * Create a scenario definition while keeping the repeated input boilerplate centralized.
 */
export function createScenario(definition: CreateScenarioOptions): ScenarioDefinition {
  return {
    ...definition,
    expect_failure: definition.expect_failure ?? false,
    inputs: createScenarioInputs(definition.inputs),
  };
}

type CreateScenarioOptions = Omit<ScenarioDefinition, 'inputs' | 'expect_failure'> & {
  inputs: Partial<ScenarioInputs>;
  expect_failure?: boolean;
};
