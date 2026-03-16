import type { ScenarioDefinition } from "../../src/types.ts";
import { createScenario } from "./shared.ts";

/**
 * Create local-photo scenarios, including the document-mode quality-preserving variant.
 */
export function createPhotoScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: "photo-local",
      description: "Send a local photo attachment",
      inputs: {
        message: "🖼️ Local photo attachment test",
        attachment: "scripts/fixtures/sample-photo.webp",
        attachment_type: "photo",
        attachment_filename: "sample-photo.webp",
      },
    }),
    createScenario({
      id: "photo-as-document",
      description: "Send a local photo as a document file (no Telegram compression)",
      inputs: {
        message: "📎 Photo sent as a document (original quality, no compression)",
        attachment: "scripts/fixtures/sample-photo.webp",
        attachment_type: "document",
        attachment_filename: "sample-photo.webp",
      },
    }),
  ];
}
