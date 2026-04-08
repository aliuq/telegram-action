import type { ScenarioDefinition } from '../../src/types.ts';
import { createScenario } from './shared.ts';

/**
 * Create the baseline text-message scenarios used by local and workflow tests.
 */
export function createMessageScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: 'basic',
      description: 'Basic text message',
      inputs: {
        message: '🚀 Hello from telegram-action!\n\nThis is a basic test message.',
      },
    }),
    createScenario({
      id: 'link-preview-enabled',
      description: 'Message with link preview enabled',
      inputs: {
        message: '🔗 Link preview test\n\nhttps://github.com',
        disable_link_preview: 'false',
      },
    }),
    createScenario({
      id: 'message-from-file',
      description: 'Message body loaded from a local file',
      inputs: {
        message_file: 'scripts/fixtures/sample-message.md',
      },
    }),
    createScenario({
      id: 'message-from-url',
      description: 'Message body loaded from a remote URL',
      inputs: {
        message_url: 'https://raw.githubusercontent.com/aliuq/aliuq/refs/heads/master/README.md',
      },
    }),
    createScenario({
      id: 'message-from-url-real',
      description: 'Message body loaded from a third-party remote URL',
      includeInActRunAll: false,
      inputs: {
        message_url: 'https://www.shadcn-vue.com/raw/docs/introduction.md',
      },
    }),
    createScenario({
      id: 'message-long-thread',
      description: 'Long text message should split into a reply chain',
      inputs: {
        message: `Long threaded message start\n\n${'A'.repeat(5000)}`,
      },
    }),
    createScenario({
      id: 'message-long-with-buttons',
      description: 'Long text message with buttons should keep buttons on the final chunk',
      inputs: {
        message: `Long message with buttons\n\n${'B'.repeat(5000)}`,
        buttons: '[{"text":"Open repository","url":"https://github.com/aliuq/telegram-action"}]',
      },
    }),
  ];
}
