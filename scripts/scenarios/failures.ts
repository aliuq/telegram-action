import type { ScenarioDefinition } from "../../src/types.ts";
import { createScenario } from "./shared.ts";

/**
 * Create parser-negative scenarios that should fail before any Telegram request is sent.
 */
export function createFailureScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: "invalid-buttons",
      description: "Invalid button payload should fail",
      expect_failure: true,
      inputs: {
        message: "⚠️ This run should fail because the buttons payload is invalid.",
        buttons: '[{"url":"https://google.com"}]',
      },
    }),
  ];
}
