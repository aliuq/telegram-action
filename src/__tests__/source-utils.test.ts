import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  assertPublicHttpUrl,
  resolveExistingWorkspacePath,
  resolveWorkspacePath,
} from '../source-utils.js';

const originalWorkspace = process.env.GITHUB_WORKSPACE;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalWorkspace === undefined) {
    delete process.env.GITHUB_WORKSPACE;
  } else {
    process.env.GITHUB_WORKSPACE = originalWorkspace;
  }
});

describe('resolveWorkspacePath', () => {
  test('keeps relative paths inside the workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'telegram-action-workspace-'));
    process.env.GITHUB_WORKSPACE = workspace;

    expect(resolveWorkspacePath('notes/report.txt')).toBe(join(workspace, 'notes/report.txt'));
  });

  test('rejects absolute paths outside the workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'telegram-action-workspace-'));
    process.env.GITHUB_WORKSPACE = workspace;

    expect(() => resolveWorkspacePath('/etc/passwd')).toThrow(
      'path must stay inside the workspace: /etc/passwd',
    );
  });

  test('rejects parent-directory traversal outside the workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'telegram-action-workspace-'));
    process.env.GITHUB_WORKSPACE = workspace;

    expect(() => resolveWorkspacePath('../secrets.txt')).toThrow(
      'path must stay inside the workspace: ../secrets.txt',
    );
  });
});

describe('resolveExistingWorkspacePath', () => {
  test('rejects symlinks that escape the workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'telegram-action-workspace-'));
    const nestedDir = join(workspace, 'nested');
    mkdirSync(nestedDir);
    const targetPath = join(tmpdir(), `telegram-action-secret-${Date.now()}.txt`);
    writeFileSync(targetPath, 'secret');
    symlinkSync(targetPath, join(nestedDir, 'link.txt'));
    process.env.GITHUB_WORKSPACE = workspace;

    expect(() => resolveExistingWorkspacePath('nested/link.txt')).toThrow(
      'path must stay inside the workspace: nested/link.txt',
    );
  });
});

describe('assertPublicHttpUrl', () => {
  test('rejects localhost hosts before fetching', async () => {
    await expect(assertPublicHttpUrl('http://localhost:8080/test')).rejects.toThrow(
      'message_url must resolve to a public internet host: http://localhost:8080/test',
    );
  });

  test('rejects private IPv4 addresses before fetching', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      'message_url must resolve to a public internet host: http://169.254.169.254/latest/meta-data',
    );
  });

  test('rejects domains that resolve to private addresses', async () => {
    await expect(
      assertPublicHttpUrl('https://example.test/path', async () => [
        { address: '127.0.0.1', family: 4 },
      ]),
    ).rejects.toThrow(
      'message_url must resolve to a public internet host: https://example.test/path',
    );
  });

  test('accepts public https hosts', async () => {
    await expect(
      assertPublicHttpUrl('https://example.com/release-notes.md', async () => [
        { address: '93.184.216.34', family: 4 },
      ]),
    ).resolves.toMatchObject({
      href: 'https://example.com/release-notes.md',
    });
  });
});
