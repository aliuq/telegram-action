import { logger } from './logger.js';
import type {
  ActRequestSummaryOptions,
  ResolvedAttachmentSource,
} from './types.js';

/**
 * Detect whether the action is running inside a local `act` session.
 *
 * The extra diagnostics stay behind this guard so normal GitHub Actions runs do
 * not get cluttered with local-only debugging output.
 */
export function isActRun(): boolean {
  return process.env.ACT === 'true' || Boolean(process.env.ACT_SCENARIO_ID);
}

/**
 * Hide most of an identifier while still keeping enough detail for debugging.
 */
function maskIdentifier(value: string): string {
  if (value.length <= 4) {
    return value;
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

/**
 * Describe the attachment source without leaking the actual path, URL, or file id.
 */
function describeAttachmentSource(source: ResolvedAttachmentSource): string {
  if (source.isLocalFile) {
    return 'local-file';
  }

  if (typeof source.value === 'string' && /^https?:\/\//.test(source.value)) {
    return 'remote-url';
  }

  return 'telegram-file-id';
}

/**
 * Render booleans in a friendlier debug format.
 */
function formatToggle(enabled: boolean): string {
  return enabled ? 'enabled' : 'disabled';
}

/**
 * Indent multi-line content so nested stack traces remain readable in logs.
 */
function indentBlock(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

/**
 * Build the local debug summary shown before a request is sent via `act` or source mode.
 */
export function formatActRequestSummary(
  options: ActRequestSummaryOptions,
): string {
  const buttonRows = options.replyMarkup?.inline_keyboard.length ?? 0;
  const buttonCount = options.replyMarkup?.inline_keyboard.flat().length ?? 0;
  const attachmentSummary = options.attachmentType
    ? `${options.attachmentType} (${options.attachmentSource ? describeAttachmentSource(options.attachmentSource) : 'unknown'})`
    : 'none';

  return [
    `Method: ${options.method}`,
    `Chat ID: ${maskIdentifier(options.chatId)}`,
    `Message: ${options.message?.length ?? 0} chars`,
    `Link preview: ${formatToggle(!options.disableLinkPreview)}`,
    `Topic target: ${options.topicId ?? 'none'}`,
    `Reply target: ${options.replyMessageId ?? 'none'}`,
    `Buttons: ${buttonRows} row(s), ${buttonCount} button(s)`,
    `Attachment: ${attachmentSummary}`,
    `Working directory: ${process.cwd()}`,
  ].join('\n');
}

/**
 * Emit a concise request summary that helps debug local `act` runs.
 */
export function logActRequestSummary(options: ActRequestSummaryOptions): void {
  if (!isActRun()) {
    return;
  }

  logger.startGroup(
    `[act] Telegram request debug${options.scenarioId ? ` (${options.scenarioId})` : ''}`,
  );
  for (const line of formatActRequestSummary(options).split('\n')) {
    logger.info(line);
  }
  logger.endGroup();
}

/**
 * Expand nested errors into a readable multi-line debug block for local runs.
 */
export function formatActErrorDetails(error: unknown): string {
  const details: string[] = [];

  if (error instanceof Error) {
    details.push(`Error: ${error.name}: ${error.message}`);
    if (error.stack) {
      details.push(`Stack:\n${indentBlock(error.stack)}`);
    }

    const nestedError = Reflect.get(error, 'error');
    if (nestedError instanceof Error) {
      details.push(`Nested error: ${nestedError.name}: ${nestedError.message}`);
      if (nestedError.stack) {
        details.push(`Nested stack:\n${indentBlock(nestedError.stack)}`);
      }
    }

    const directCause = Reflect.get(error, 'cause');
    if (directCause instanceof Error) {
      details.push(`Cause: ${directCause.name}: ${directCause.message}`);
      if (directCause.stack) {
        details.push(`Cause stack:\n${indentBlock(directCause.stack)}`);
      }
    }
  } else {
    details.push(`Error: ${String(error)}`);
  }

  return details.join('\n');
}

/**
 * Print nested causes for local failures so maintainers can quickly distinguish
 * parser problems from network and `act` transport issues.
 */
export function logActErrorDetails(error: unknown): void {
  if (!isActRun()) {
    return;
  }

  logger.startGroup('[act] Telegram request failure details');
  for (const detail of formatActErrorDetails(error).split('\n')) {
    logger.info(detail);
  }
  logger.endGroup();
}
