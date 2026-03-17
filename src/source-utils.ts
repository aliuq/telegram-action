import { resolve } from 'node:path';

/**
 * Distinguish path-like inputs from opaque identifiers such as Telegram file ids.
 */
export function looksLikeLocalPath(input: string): boolean {
  return (
    input.startsWith('./') ||
    input.startsWith('../') ||
    input.startsWith('/') ||
    input.includes('/') ||
    input.includes('\\')
  );
}

/**
 * Detect HTTP(S) URLs that should be fetched or handed off remotely.
 */
export function isRemoteUrl(input: string): boolean {
  return /^https?:\/\//.test(input);
}

/**
 * Resolve a repository-relative path against the workspace root.
 * Prefers `GITHUB_WORKSPACE` when running inside GitHub Actions,
 * falling back to `process.cwd()` for local development.
 */
export function resolveWorkspacePath(input: string): string {
  const base = process.env.GITHUB_WORKSPACE || process.cwd();
  return resolve(base, input);
}
