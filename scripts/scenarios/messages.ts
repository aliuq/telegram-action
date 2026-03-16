import type { ScenarioDefinition } from "../../src/types.ts";
import { createScenario, SAMPLE_MESSAGE_URL } from "./shared.ts";

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
    createScenario({
      id: "message-from-file",
      description: "Message body loaded from a local file",
      inputs: {
        message_file: "scripts/fixtures/sample-message.md",
      },
    }),
    createScenario({
      id: "message-from-url-mock",
      description: "Message body loaded from a remote URL",
      inputs: {
        message_url: SAMPLE_MESSAGE_URL,
      },
    }),
    createScenario({
      id: "message-from-url-real",
      description: "Message body loaded from a remote URL without test override (real HTTP request)",
      inputs: {
        message_url: "https://www.shadcn-vue.com/raw/docs/introduction.md",
        stream_response: "true",
      },
    }),
    createScenario({
      id: "message-long-thread",
      description: "Long text message should split into a reply chain",
      inputs: {
        message: `Long threaded message start\n\n${"A".repeat(5000)}`,
      },
    }),
    createScenario({
      id: "message-long-with-buttons",
      description: "Long text message with buttons should keep buttons on the final chunk",
      inputs: {
        message: `Long message with buttons\n\n${"B".repeat(5000)}`,
        buttons: '[{"text":"Open repository","url":"https://github.com/aliuq/telegram-action"}]',
      },
    }),
    createScenario({
      id: "message-streaming-response",
      description: "Text-only message streamed with Telegram drafts in supported private chats",
      inputs: {
        message: [
          "Streaming response demo",
          "",
          "This message is revealed progressively so long-running jobs can post visible incremental output.",
          "",
          "- Step 1: prepare",
          "- Step 2: build",
          "- Step 3: publish",
        ].join("\n"),
        stream_response: "true",
      },
    }),
    createScenario({
      id: "message-streaming-with-buttons",
      description: "Streaming response should attach buttons only after the final streamed message is finalized",
      inputs: {
        message: [
          "Streaming response with buttons",
          "",
          "The message should update progressively and expose buttons only after it reaches the final text.",
        ].join("\n"),
        stream_response: "true",
        buttons: '[{"text":"Open repository","url":"https://github.com/aliuq/telegram-action"}]',
      },
    }),
    createScenario({
      id: "message-streaming-long-thread",
      description:
        "Long streaming response should continue through draft updates and finalize as reply-chained messages when it exceeds Telegram limits",
      inputs: {
        message: Array.from(
          { length: 80 },
          (_, index) =>
            `Chunk ${index + 1}: streaming output keeps arriving with enough detail to exercise Telegram draft streaming and final message chaining.`,
        ).join("\n\n"),
        stream_response: "true",
      },
    }),
  ];
}
