import type { ScenarioDefinition } from "../../src/types.ts";
import { createScenario } from "./shared.ts";

/**
 * Create reply-mode scenarios for threaded and topic-style conversations.
 */
export function createReplyScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: "group-reply",
      description: "Reply inside a topic or threaded chat",
      inputs: {
        message: "↩️ This is a group topic reply message.",
        reply_to_message_id: "env",
      },
    }),
    createScenario({
      id: "group-reply-with-buttons",
      description: "Reply inside a topic with buttons",
      inputs: {
        message: "↩️ Topic reply with buttons",
        reply_to_message_id: "env",
        buttons: '[{"text":"Open repository","url":"https://github.com"}]',
      },
    }),
  ];
}
