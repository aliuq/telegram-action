import { resolve } from "node:path";

/**
 * Distinguish path-like inputs from opaque identifiers such as Telegram file ids.
 */
export function looksLikeLocalPath(input: string): boolean {
  return (
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.startsWith("/") ||
    input.includes("/") ||
    input.includes("\\")
  );
}

/**
 * Detect HTTP(S) URLs that should be fetched or handed off remotely.
 */
export function isRemoteUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}

/**
 * Resolve a repository-relative path against the current workspace root.
 */
export function resolveWorkspacePath(input: string): string {
  return resolve(process.cwd(), input);
}
