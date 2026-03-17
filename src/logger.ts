import * as core from '@actions/core';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'GROUP';
export type LoggerMode = 'github-actions' | 'plain';

export interface LoggerTarget {
  mode: LoggerMode;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  startGroup(title: string): void;
  endGroup(): void;
  fail(message: string): void;
}

interface CreateLoggerOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  target?: LoggerTarget;
}

export function isGitHubActionsRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.GITHUB_ACTIONS === 'true';
}

export function formatLogLines(
  level: LogLevel,
  message: string,
  timestamp: string = new Date().toISOString(),
): string[] {
  const lines = message.split(/\r?\n/);
  return lines.map((line) => `[${timestamp}] [${level}] ${line}`);
}

function createDefaultTarget(mode: LoggerMode): LoggerTarget {
  if (mode === 'github-actions') {
    return {
      mode,
      info: (message) => core.info(message),
      warn: (message) => core.warning(message),
      error: (message) => core.error(message),
      startGroup: (title) => core.startGroup(title),
      endGroup: () => core.endGroup(),
      fail: (message) => core.setFailed(message),
    };
  }

  return {
    mode,
    info: (message) => console.info(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
    startGroup: () => {},
    endGroup: () => {},
    fail: (message) => {
      console.error(message);
      process.exitCode = 1;
    },
  };
}

export class Logger {
  readonly #target: LoggerTarget;
  readonly #now: () => string;
  readonly #groupStack: string[] = [];

  constructor(options: CreateLoggerOptions = {}) {
    const mode = isGitHubActionsRuntime(options.env)
      ? 'github-actions'
      : 'plain';
    this.#target = options.target ?? createDefaultTarget(mode);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  #emit(level: LogLevel, message: string, method: 'info' | 'warn' | 'error') {
    const timestamp = this.#now();
    for (const line of formatLogLines(level, message, timestamp)) {
      this.#target[method](line);
    }
  }

  info(message: string): void {
    this.#emit('INFO', message, 'info');
  }

  warn(message: string): void {
    this.#emit('WARN', message, 'warn');
  }

  error(message: string): void {
    this.#emit('ERROR', message, 'error');
  }

  startGroup(label: string): void {
    this.#groupStack.push(label);
    const title = formatLogLines('GROUP', label, this.#now())[0];

    if (this.#target.mode === 'github-actions') {
      this.#target.startGroup(title);
      return;
    }

    this.#target.info(title);
  }

  endGroup(): void {
    const label = this.#groupStack.pop();
    const endMessage = label ? `End group: ${label}` : 'End group';
    this.#emit('GROUP', endMessage, 'info');

    if (this.#target.mode === 'github-actions') {
      this.#target.endGroup();
    }
  }

  async withGroup<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    this.startGroup(label);
    try {
      return await fn();
    } finally {
      this.endGroup();
    }
  }

  fail(message: string): void {
    const formattedMessage = formatLogLines('ERROR', message, this.#now()).join(
      '\n',
    );
    this.#target.fail(formattedMessage);
  }
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  return new Logger(options);
}

export const logger = createLogger();
