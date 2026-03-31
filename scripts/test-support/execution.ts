import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, writeFileSync } from 'node:fs';
import * as p from '@clack/prompts';
import { formatActErrorDetails, formatActRequestSummary } from '../../src/act-logging.ts';
import { parseActionInputs } from '../../src/inputs.ts';
import { sendTelegramMessage } from '../../src/telegram.ts';
import type { ScenarioDefinition, TestSelection } from '../../src/types.ts';
import { showCancel, showError, showNote, showStep, showSuccess } from './output.ts';
import { buildRawActionInputs, describeRequestMethod, ROOT, SECRET_FILE_PATH } from './shared.ts';

/**
 * Ensure act mode has a repository-root secret file to read from.
 */
function ensureSecretFileExists(): void {
  if (!existsSync(SECRET_FILE_PATH)) {
    throw new Error(
      'Missing .env file in the repository root. Create it with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID before running act mode.',
    );
  }
}

/**
 * Build the act CLI arguments for the integration workflow.
 */
function buildActArgs(selection: TestSelection): string[] {
  return [
    'workflow_dispatch',
    '-W',
    `${ROOT}/.github/workflows/test.yaml`,
    // "-j",
    // "notification",
    '-C',
    ROOT,
    '--action-offline-mode',
    '--pull=false',
    '--secret-file',
    '.env',
    '--input',
    `scenario_ids=${selection.runAll ? 'all' : selection.scenarioIds.join(',')}`,
  ];
}

function shellEscape(arg: string): string {
  if (/^[\w./:=,@-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\\''")}'`;
}

/**
 * Format the act invocation as a shell command for prompts and logs.
 */
function formatActCommand(selection: TestSelection): string {
  return ['act', ...buildActArgs(selection)].map((arg) => shellEscape(arg)).join(' ');
}

/**
 * Run the selected scenarios through the local GitHub Actions workflow via act.
 */
export async function runActSelection(
  selection: TestSelection,
  logFilePath: string,
): Promise<void> {
  ensureSecretFileExists();
  const actCommand = formatActCommand(selection);
  const logStream = createWriteStream(logFilePath, { flags: 'a' });
  showNote(actCommand, 'Command to execute');

  const shouldRun = await p.confirm({
    message: selection.runAll
      ? 'Run all workflow scenarios with act now?'
      : `Run selected workflow scenarios with act: ${selection.scenarioIds.join(', ')}?`,
    initialValue: true,
  });

  if (p.isCancel(shouldRun) || !shouldRun) {
    showCancel('Cancelled before execution');
    process.exit(0);
  }

  // Add spacing after the prompt before act's output starts for better readability
  console.log();

  const scriptArgs = ['-qefc', actCommand, '/dev/null'];
  const child = spawn('script', scriptArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      CLICOLOR_FORCE: '1',
      TERM: process.env.TERM || 'xterm-256color',
    },
  });

  let sawOutput = false;
  child.stdout?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    sawOutput = true;
    process.stdout.write(chunk);
    logStream.write(chunk);
  });
  child.stderr?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    sawOutput = true;
    process.stderr.write(chunk);
    logStream.write(chunk);
  });

  const exitCode = await new Promise<number>((resolveExitCode, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolveExitCode(code ?? 1));
  });
  logStream.end();

  if (!sawOutput) {
    showError('act exited without output');
  }

  if (exitCode !== 0) {
    throw new Error(`act exited with code ${exitCode}`);
  }
}

/**
 * Run scenarios directly against the source implementation without invoking act.
 */
export async function runSourceSelection(
  scenarios: ScenarioDefinition[],
  logFilePath: string,
): Promise<void> {
  const logLines: string[] = [];
  const previousActScenarioId = process.env.ACT_SCENARIO_ID;

  delete process.env.ACT_SCENARIO_ID;

  try {
    for (const scenario of scenarios) {
      if (scenario.expect_failure) {
        try {
          const request = await parseActionInputs(buildRawActionInputs(scenario, true));
          const requestSummary = formatActRequestSummary({
            scenarioId: request.scenarioId,
            method: describeRequestMethod(request),
            chatId: request.chatId,
            message: request.message,
            disableLinkPreview: request.disableLinkPreview,
            topicId: request.topicId,
            replyMessageId: request.replyMessageId,
            replyMarkup: request.replyMarkup,
            attachmentType: request.attachmentType,
            attachmentSource: request.attachmentSource,
          });
          showNote(requestSummary, `[source] Send preview (${scenario.id})`);
          logLines.push(`[debug:${scenario.id}]\n${requestSummary}`);
          await sendTelegramMessage(request);
        } catch (error) {
          const details = formatActErrorDetails(error);
          showNote(details, `[source] Send failure details (${scenario.id})`);
          logLines.push(`[debug:${scenario.id}]\n${details}`);
          const message = `[expected failure] ${scenario.id}: ${error instanceof Error ? error.message : String(error)}`;
          showStep(message);
          logLines.push(message);
          continue;
        }

        throw new Error(
          `Scenario "${scenario.id}" is marked as expect_failure but completed successfully`,
        );
      }

      const request = await parseActionInputs(buildRawActionInputs(scenario, true));
      const requestSummary = formatActRequestSummary({
        scenarioId: request.scenarioId,
        method: describeRequestMethod(request),
        chatId: request.chatId,
        message: request.message,
        disableLinkPreview: request.disableLinkPreview,
        topicId: request.topicId,
        replyMessageId: request.replyMessageId,
        replyMarkup: request.replyMarkup,
        attachmentType: request.attachmentType,
        attachmentSource: request.attachmentSource,
      });
      showNote(requestSummary, `[source] Send preview (${scenario.id})`);
      logLines.push(`[debug:${scenario.id}]\n${requestSummary}`);

      const result = await sendTelegramMessage(request);
      const message = `Sent scenario "${scenario.id}" (message_id=${result.message_id})`;
      showSuccess(message);
      logLines.push(message);
    }
  } finally {
    if (previousActScenarioId === undefined) {
      delete process.env.ACT_SCENARIO_ID;
    } else {
      process.env.ACT_SCENARIO_ID = previousActScenarioId;
    }
  }

  writeFileSync(logFilePath, `${logLines.join('\n')}\n`);
}

/**
 * Validate scenarios locally without sending any Telegram requests.
 */
export async function runValidationSelection(
  scenarios: ScenarioDefinition[],
  logFilePath: string,
): Promise<void> {
  const logLines: string[] = [];

  for (const scenario of scenarios) {
    const runValidation = () => parseActionInputs(buildRawActionInputs(scenario, false));

    if (scenario.expect_failure) {
      try {
        await runValidation();
      } catch (error) {
        const message = `[expected failure] ${scenario.id}: ${error instanceof Error ? error.message : String(error)}`;
        showStep(message);
        logLines.push(message);
        continue;
      }

      throw new Error(
        `Scenario "${scenario.id}" is marked as expect_failure but the parser accepted it`,
      );
    }

    await runValidation();
    const message = `Validated scenario "${scenario.id}" against the action parser`;
    showSuccess(message);
    logLines.push(message);
  }

  writeFileSync(logFilePath, `${logLines.join('\n')}\n`);
}
