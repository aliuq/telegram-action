import type { ScenarioDefinition } from "../../src/types.ts";
import { createScenario } from "./shared.ts";

/**
 * Create the baseline text-message scenarios used by local and workflow tests.
 */
export function createMessageScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: "basic",
      description: "Basic text message",
      inputs: {
        message: "🚀 Hello from telegram-action!\n\nThis is a basic test message.",
      },
    }),
    createScenario({
      id: "link-preview-enabled",
      description: "Message with link preview enabled",
      inputs: {
        message: "🔗 Link preview test\n\nhttps://github.com",
        disable_link_preview: "false",
      },
    }),
  ];
}
