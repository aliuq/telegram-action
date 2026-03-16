import type { ScenarioDefinition, ScenarioInputs } from "../../src/types.ts";

export const SAMPLE_MESSAGE_URL = "https://example.com/telegram-action/sample-message.md";
export const TEST_MESSAGE_URL_OVERRIDES = {
  [SAMPLE_MESSAGE_URL]: [
    "# Remote URL message",
    "",
    "This body comes from the test-only remote URL override.",
    "",
    "- It exercises `message_url`",
    "- It keeps local validation deterministic",
  ].join("\n"),
};

/**
 * Build a scenario input payload from the shared defaults used across examples.
 */
export function createScenarioInputs(overrides: Partial<ScenarioInputs>): ScenarioInputs {
  return {
    message: "",
    message_file: "",
    message_url: "",
    reply_to_message_id: "",
    disable_link_preview: "true",
    buttons: "",
    attachment: "",
    attachments: "",
    attachment_type: "",
    attachment_filename: "",
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

type CreateScenarioOptions = Omit<ScenarioDefinition, "inputs" | "expect_failure"> & {
  inputs: Partial<ScenarioInputs>;
  expect_failure?: boolean;
};
