import type { ScenarioDefinition } from '../../src/types.ts';
import { createScenario } from './shared.ts';

/**
 * Create inline-keyboard scenarios covering supported button payload shapes.
 */
export function createButtonScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: 'buttons-flat',
      description: 'Inline buttons using flat single-row JSON',
      inputs: {
        message: '🔘 Button test (flat format)',
        buttons:
          '[{"text":"View commit","url":"https://github.com/aliuq/telegram-action"},{"text":"Open repository","url":"https://github.com/aliuq/telegram-action"}]',
      },
    }),
    createScenario({
      id: 'buttons-styled',
      description: 'Inline buttons using Telegram button styles',
      inputs: {
        message: '🔘 Button test (styled)',
        buttons:
          '[[{"text":"Open workflow","url":"https://github.com/aliuq/telegram-action/actions","style":"primary"},{"text":"Healthy","callback_data":"healthy","style":"success"}],[{"text":"Rollback","callback_data":"rollback","style":"danger"}]]',
      },
    }),
    createScenario({
      id: 'buttons-nested',
      description: 'Inline buttons using nested multi-row JSON',
      inputs: {
        message: '🔘 Button test (nested format)',
        buttons:
          '[[{"text":"Google","url":"https://google.com"},{"text":"GitHub","url":"https://github.com"}],[{"text":"X (Twitter)","url":"https://x.com"}]]',
      },
    }),
    createScenario({
      id: 'buttons-callback',
      description: 'Inline buttons using callback_data',
      inputs: {
        message: '🔘 Callback button test',
        buttons:
          '[{"text":"Callback A","callback_data":"action_a"},{"text":"Callback B","callback_data":"action_b"}]',
      },
    }),
  ];
}
