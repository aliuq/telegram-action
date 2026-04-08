import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { logger } from '../src/logger.ts';
import { loadScenarios, resolveScenarioSelection } from './scenarios/index.ts';

const ACTION_INPUT_NAMES = [
  'message',
  'message_file',
  'message_url',
  'buttons',
  'disable_link_preview',
  'attachment',
  'attachments',
  'attachment_type',
  'attachment_filename',
  'supports_streaming',
  'exit_on_fail',
] as const;

function createGitHubOutputFile(prefix: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'telegram-action-'));
  const outputFilePath = join(tempDir, `${prefix}.txt`);
  writeFileSync(outputFilePath, '');
  return outputFilePath;
}

function cleanupGitHubOutputFile(outputFilePath: string): void {
  rmSync(dirname(outputFilePath), { recursive: true, force: true });
}

function parseGitHubOutputFile(outputFilePath: string): Record<string, string> {
  const content = readFileSync(outputFilePath, 'utf8');
  const outputs: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    const multilineMatch = line.match(/^([^<]+)<<(.+)$/);
    if (multilineMatch) {
      const [, name, delimiter] = multilineMatch;
      const valueLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== delimiter) {
        valueLines.push(lines[index]);
        index += 1;
      }
      outputs[name] = valueLines.join('\n');
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex !== -1) {
      outputs[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
    }
  }

  return outputs;
}

function shellEscape(arg: string): string {
  if (/^[\w./:=,@-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\\''")}'`;
}

async function runLoggedCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  logger.info(`$ ${[command, ...args].map((arg) => shellEscape(arg)).join(' ')}`);

  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });

  return await new Promise<number>((resolveExitCode, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolveExitCode(code ?? 1));
  });
}

/**
 * Verify that the action outcome matches the scenario's expected pass/fail state.
 */
function assertScenarioOutcome(scenarioId: string, expectFailure: boolean, outcome: string): void {
  const expectedOutcome = expectFailure ? 'failure' : 'success';

  if (outcome !== expectedOutcome) {
    throw new Error(
      `Expected scenario '${scenarioId}' to ${expectedOutcome}, but got '${outcome}'.`,
    );
  }

  logger.info(`Scenario '${scenarioId}' finished with the expected outcome.`);
}

async function runSelectedScenarios(): Promise<void> {
  const scenarios = await loadScenarios();
  const isActWorkflowRun = process.env.ACT === 'true';
  const selection = resolveScenarioSelection(scenarios, process.env.SCENARIO_IDS, {
    runAllFilter: isActWorkflowRun
      ? (scenario) => scenario.includeInActRunAll !== false
      : undefined,
  });

  if (
    isActWorkflowRun &&
    selection.runAll &&
    selection.selectedScenarios.length !== scenarios.length
  ) {
    const skippedScenarioIds = scenarios
      .filter((scenario) => !selection.selectedScenarios.some((entry) => entry.id === scenario.id))
      .map((scenario) => scenario.id);

    logger.info(
      `Skipping act run-all scenarios that depend on external third-party availability: ${skippedScenarioIds.join(', ')}`,
    );
  }

  logger.info(`Resolved ${selection.selectedScenarios.length} scenario(s).`);

  for (const scenario of selection.selectedScenarios) {
    const outputFilePath = createGitHubOutputFile(`action-${scenario.id}`);

    await logger
      .withGroup(`Run scenario — ${scenario.id}`, async () => {
        const actionEnv: NodeJS.ProcessEnv = {
          ...process.env,
          ACT_SCENARIO_ID: scenario.id,
          GITHUB_OUTPUT: outputFilePath,
          TELEGRAM_ACTION_EXPECT_FAILURE: scenario.expect_failure ? 'true' : 'false',
        };

        for (const inputName of ACTION_INPUT_NAMES) {
          actionEnv[`INPUT_${inputName.toUpperCase()}`] = scenario.inputs[inputName] ?? '';
        }

        const exitCode = await runLoggedCommand('node', ['dist/index.js'], actionEnv);
        const outputs = parseGitHubOutputFile(outputFilePath);
        const outcome = exitCode === 0 ? 'success' : 'failure';

        assertScenarioOutcome(scenario.id, scenario.expect_failure, outcome);

        if (outcome === 'success') {
          if (outputs.message_id) {
            logger.info(`message_id=${outputs.message_id}`);
          }
          if (outputs.status) {
            logger.info(`status=${outputs.status}`);
          }
        } else {
          logger.info(`[expected failure] ${scenario.id}`);
        }
      })
      .finally(() => {
        cleanupGitHubOutputFile(outputFilePath);
      });
  }
}

void runSelectedScenarios().catch((error) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
