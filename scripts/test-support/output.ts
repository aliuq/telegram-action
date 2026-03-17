import * as p from '@clack/prompts';
import { logger } from '../../src/logger.ts';

function shouldUsePromptRendering(): boolean {
  return (
    process.stdout.isTTY &&
    process.stderr.isTTY &&
    !process.env.CI &&
    process.env.GITHUB_ACTIONS !== 'true' &&
    process.env.ACT !== 'true'
  );
}

export function showNote(message: string, title: string): void {
  if (shouldUsePromptRendering()) {
    p.note(message, title);
    return;
  }

  logger.info(`${title}:`);
  logger.info(message);
}

export function showSuccess(message: string): void {
  if (shouldUsePromptRendering()) {
    p.log.success(message);
    return;
  }

  logger.info(message);
}

export function showStep(message: string): void {
  if (shouldUsePromptRendering()) {
    p.log.step(message);
    return;
  }

  logger.info(message);
}

export function showError(message: string): void {
  if (shouldUsePromptRendering()) {
    p.log.error(message);
    return;
  }

  logger.error(message);
}

export function showOutro(message: string): void {
  if (shouldUsePromptRendering()) {
    p.outro(message);
    return;
  }

  logger.info(message);
}

export function showCancel(message: string): void {
  if (shouldUsePromptRendering()) {
    p.cancel(message);
    return;
  }

  logger.warn(message);
}
