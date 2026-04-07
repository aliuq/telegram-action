import { describe, expect, test } from 'vitest';
import { getLocalDebugMode, isActRun, isLocalDebugRun } from '../act-logging.js';

describe('local debug mode detection', () => {
  test('detects source mode from explicit local runner env', () => {
    const env = { TELEGRAM_ACTION_LOCAL_DEBUG_MODE: 'source' };

    expect(getLocalDebugMode(env)).toBe('source');
    expect(isLocalDebugRun(env)).toBe(true);
    expect(isActRun(env)).toBe(false);
  });

  test('detects act mode from act env', () => {
    const env = { ACT: 'true' };

    expect(getLocalDebugMode(env)).toBe('act');
    expect(isLocalDebugRun(env)).toBe(true);
    expect(isActRun(env)).toBe(true);
  });

  test('falls back to non-local mode when no local env is present', () => {
    expect(getLocalDebugMode({})).toBeUndefined();
    expect(isLocalDebugRun({})).toBe(false);
    expect(isActRun({})).toBe(false);
  });
});
