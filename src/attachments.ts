import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { InputFile } from 'grammy';
import { isRemoteUrl, looksLikeLocalPath, resolveWorkspacePath } from './source-utils.js';
import type { ResolvedAttachmentSource } from './types.js';

/**
 * Resolve local attachments eagerly and reject missing path-like values.
 *
 * The existence check runs before path heuristics so valid repository-relative
 * paths such as `scripts/fixtures/sample-photo.webp` work as expected.
 */
export function resolveAttachmentSource(
  input: string,
  filename?: string,
): ResolvedAttachmentSource {
  const resolvedPath = resolveWorkspacePath(input);
  if (existsSync(resolvedPath)) {
    return {
      value: new InputFile(readFileSync(resolvedPath), filename || basename(resolvedPath)),
      isLocalFile: true,
    };
  }

  if (isRemoteUrl(input)) {
    return {
      value: input,
      isLocalFile: false,
    };
  }

  if (looksLikeLocalPath(input)) {
    throw new Error(`attachment path does not exist: ${input}`);
  }

  return {
    value: input,
    isLocalFile: false,
  };
}
