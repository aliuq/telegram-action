import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { InputFile } from "grammy";
import type { ResolvedAttachmentSource } from "./types.js";

/**
 * Distinguish path-like inputs from Telegram file ids.
 *
 * Repository-relative fixture paths often do not start with `./`, so a simple
 * prefix check would incorrectly treat missing local files as Telegram file ids.
 */
function looksLikeLocalPath(input: string): boolean {
  return (
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.startsWith("/") ||
    input.includes("/") ||
    input.includes("\\")
  );
}

/**
 * Preserve remote attachment URLs so Telegram can fetch them directly.
 */
function isRemoteUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}

/**
 * Resolve local attachments eagerly and reject missing path-like values.
 *
 * The existence check runs before path heuristics so valid repository-relative
 * paths such as `scripts/fixtures/sample-photo.webp` work as expected.
 */
export function resolveAttachmentSource(input: string, filename?: string): ResolvedAttachmentSource {
  const resolvedPath = resolve(process.cwd(), input);
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
