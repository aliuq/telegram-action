import type { ScenarioDefinition } from '../../src/types.ts';
import { createScenario } from './shared.ts';

/**
 * Create video scenarios that cover both Telegram-hosted and file-style delivery.
 */
export function createVideoScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: 'video-url',
      description: 'Send a video attachment from a public URL',
      inputs: {
        message: '🎬 Video attachment test',
        attachment: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
        attachment_type: 'video',
      },
    }),
    createScenario({
      id: 'video-as-document',
      description:
        'Send a local video as a document file (no Telegram streaming/compression)',
      inputs: {
        message: '📎 Video sent as a document file',
        attachment: 'scripts/fixtures/sample-video.mp4',
        attachment_type: 'document',
        attachment_filename: 'sample-video.mp4',
      },
    }),
    createScenario({
      id: 'video-streaming',
      description: 'Send a video with Telegram streaming mode enabled',
      inputs: {
        message: '▶️ Streaming video test',
        attachment: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
        attachment_type: 'video',
        supports_streaming: 'true',
      },
    }),
  ];
}
