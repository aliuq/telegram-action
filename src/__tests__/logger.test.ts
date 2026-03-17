import { describe, expect, test } from 'vitest';
import {
  createLogger,
  formatLogLines,
  isGitHubActionsRuntime,
  type LoggerTarget,
} from '../logger.js';

function createMemoryTarget(mode: 'github-actions' | 'plain'): LoggerTarget & {
  infoMessages: string[];
  warnMessages: string[];
  errorMessages: string[];
  groupTitles: string[];
  failMessages: string[];
  endGroupCount: number;
} {
  const infoMessages: string[] = [];
  const warnMessages: string[] = [];
  const errorMessages: string[] = [];
  const groupTitles: string[] = [];
  const failMessages: string[] = [];
  let endGroupCount = 0;

  return {
    mode,
    infoMessages,
    warnMessages,
    errorMessages,
    groupTitles,
    failMessages,
    get endGroupCount() {
      return endGroupCount;
    },
    info: (message) => infoMessages.push(message),
    warn: (message) => warnMessages.push(message),
    error: (message) => errorMessages.push(message),
    startGroup: (title) => groupTitles.push(title),
    endGroup: () => {
      endGroupCount += 1;
    },
    fail: (message) => failMessages.push(message),
  };
}

describe('logger helpers', () => {
  test('detects GitHub Actions runtime from env', () => {
    expect(isGitHubActionsRuntime({ GITHUB_ACTIONS: 'true' })).toBe(true);
    expect(isGitHubActionsRuntime({ GITHUB_ACTIONS: 'false' })).toBe(false);
    expect(isGitHubActionsRuntime({})).toBe(false);
  });

  test('formats each line with timestamp and level', () => {
    expect(
      formatLogLines('INFO', 'hello\nworld', '2026-03-17T07:00:00.000Z'),
    ).toEqual([
      '[2026-03-17T07:00:00.000Z] [INFO] hello',
      '[2026-03-17T07:00:00.000Z] [INFO] world',
    ]);
  });
});

describe('plain logger', () => {
  test('writes plain timestamped logs without GitHub group commands', () => {
    const target = createMemoryTarget('plain');
    const logger = createLogger({
      env: {},
      now: () => '2026-03-17T07:00:00.000Z',
      target,
    });

    logger.startGroup('Run scenario');
    logger.info('line one\nline two');
    logger.warn('careful');
    logger.error('broken');
    logger.endGroup();

    expect(target.groupTitles).toEqual([]);
    expect(target.endGroupCount).toBe(0);
    expect(target.infoMessages).toEqual([
      '[2026-03-17T07:00:00.000Z] [GROUP] Run scenario',
      '[2026-03-17T07:00:00.000Z] [INFO] line one',
      '[2026-03-17T07:00:00.000Z] [INFO] line two',
      '[2026-03-17T07:00:00.000Z] [GROUP] End group: Run scenario',
    ]);
    expect(target.warnMessages).toEqual([
      '[2026-03-17T07:00:00.000Z] [WARN] careful',
    ]);
    expect(target.errorMessages).toEqual([
      '[2026-03-17T07:00:00.000Z] [ERROR] broken',
    ]);
  });
});

describe('github actions logger', () => {
  test('uses grouped output and timestamps the closing marker message', () => {
    const target = createMemoryTarget('github-actions');
    const logger = createLogger({
      env: { GITHUB_ACTIONS: 'true' },
      now: () => '2026-03-17T07:00:00.000Z',
      target,
    });

    logger.startGroup('Run scenario');
    logger.info('inside group');
    logger.endGroup();
    logger.fail('fatal');

    expect(target.groupTitles).toEqual([
      '[2026-03-17T07:00:00.000Z] [GROUP] Run scenario',
    ]);
    expect(target.infoMessages).toEqual([
      '[2026-03-17T07:00:00.000Z] [INFO] inside group',
      '[2026-03-17T07:00:00.000Z] [GROUP] End group: Run scenario',
    ]);
    expect(target.endGroupCount).toBe(1);
    expect(target.failMessages).toEqual([
      '[2026-03-17T07:00:00.000Z] [ERROR] fatal',
    ]);
  });
});
