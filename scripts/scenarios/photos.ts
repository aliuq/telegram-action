import type { ScenarioDefinition } from '../../src/types.ts';
import { createScenario } from './shared.ts';

function createPhotoAttachmentBatch(count: number): string {
  return JSON.stringify(
    Array.from({ length: count }, (_, index) => ({
      type: 'photo',
      source: 'scripts/fixtures/sample-photo.webp',
      filename: `sample-photo-${index + 1}.webp`,
      ...(index === 0 ? { caption: `Photo ${index + 1}` } : {}),
    })),
  );
}

/**
 * Create local-photo scenarios, including the document-mode quality-preserving variant.
 */
export function createPhotoScenarios(): ScenarioDefinition[] {
  return [
    createScenario({
      id: 'photo-local',
      description: 'Send a local photo attachment',
      inputs: {
        message: '🖼️ Local photo attachment test',
        attachment: 'scripts/fixtures/sample-photo.webp',
        attachment_type: 'photo',
        attachment_filename: 'sample-photo.webp',
      },
    }),
    createScenario({
      id: 'photo-as-document',
      description: 'Send a local photo as a document file (no Telegram compression)',
      inputs: {
        message: '📎 Photo sent as a document (original quality, no compression)',
        attachment: 'scripts/fixtures/sample-photo.webp',
        attachment_type: 'document',
        attachment_filename: 'sample-photo.webp',
      },
    }),
    createScenario({
      id: 'media-group-visual',
      description: 'Send multiple visual items in one attachments batch',
      inputs: {
        message: '🖼️ Visual media group',
        attachments: JSON.stringify([
          {
            type: 'photo',
            source: 'scripts/fixtures/sample-photo.webp',
            filename: 'sample-photo.webp',
            caption: 'First photo in the group',
          },
          {
            type: 'video',
            source: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
          },
        ]),
      },
    }),
    createScenario({
      id: 'media-group-9-items',
      description: 'Send 9 photo items in a single media group batch',
      inputs: {
        message: '9 photo items',
        attachments: createPhotoAttachmentBatch(9),
      },
    }),
    createScenario({
      id: 'media-group-10-items',
      description: 'Send 10 photo items in a single max-sized media group batch',
      inputs: {
        message: '10 photo items',
        attachments: createPhotoAttachmentBatch(10),
      },
    }),
    createScenario({
      id: 'media-group-15-items',
      description: 'Send 15 photo items split across multiple media group batches',
      inputs: {
        message: '15 photo items',
        attachments: createPhotoAttachmentBatch(15),
      },
    }),
    createScenario({
      id: 'attachment-long-caption-fallback',
      description: 'Long attachment text should send leading chunks before the attachment',
      inputs: {
        message: `Attachment fallback start\n\n${'C'.repeat(10000)}`,
        buttons: '[{"text":"Open repository","url":"https://github.com/aliuq/telegram-action"}]',
        attachment: 'scripts/fixtures/sample-photo.webp',
        attachment_type: 'photo',
        attachment_filename: 'sample-photo.webp',
      },
    }),
  ];
}
