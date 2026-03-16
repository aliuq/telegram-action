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
    createScenario({
      id: "message-source-conflict",
      description: "Multiple message sources should fail validation",
      expect_failure: true,
      inputs: {
        message: "Inline text",
        message_file: "scripts/fixtures/sample-message.md",
      },
    }),
    createScenario({
      id: "attachment-conflict",
      description: "Single and multi attachment inputs should not be combined",
      expect_failure: true,
      inputs: {
        attachment: "scripts/fixtures/sample-document.txt",
        attachment_type: "document",
        attachments: '[{"type":"document","source":"scripts/fixtures/sample-document.txt"}]',
      },
    }),
    createScenario({
      id: "stream-response-attachment-conflict",
      description: "Streaming text mode should reject attachment sends",
      expect_failure: true,
      inputs: {
        message: "This should fail because streaming responses are text-only for now.",
        stream_response: "true",
        attachment: "scripts/fixtures/sample-photo.webp",
        attachment_type: "photo",
      },
    }),
    createScenario({
      id: "stream-response-missing-message",
      description: "Streaming mode should fail when no text message source is provided",
      expect_failure: true,
      inputs: {
        stream_response: "true",
      },
    }),
  ];
}
