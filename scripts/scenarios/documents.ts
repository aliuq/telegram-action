import type { ScenarioDefinition } from "../../src/types.ts";
import { createScenario } from "./shared.ts";

/**
 * Create document-upload scenarios for local validation and integration tests.
 */
export function createDocumentScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: "document-local",
      description: "Send a local document attachment",
      inputs: {
        message: "📎 Local document attachment test",
        attachment: "scripts/fixtures/sample-document.txt",
        attachment_type: "document",
        attachment_filename: "sample-document.txt",
      },
    }),
  ];
}
