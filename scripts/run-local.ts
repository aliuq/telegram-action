import { findScenarioById, loadScenarios } from "./github-script/scenario-utils.mjs";

interface ScenarioInputs {
  message: string;
  disable_link_preview: string;
  buttons: string;
  attachment: string;
  attachment_type: string;
  attachment_filename: string;
}

interface TestScenario {
  id: string;
  description: string;
  requires_group: boolean;
  expect_failure: boolean;
  inputs: ScenarioInputs;
}

const DEFAULT_SCENARIO_ID = "basic";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function setActionInput(name: string, value: string): void {
  process.env[`INPUT_${name.toUpperCase()}`] = value;
}

async function main() {
  const scenarios = (await loadScenarios()) as TestScenario[];
  const scenarioId = process.argv[2] ?? process.env.LOCAL_SCENARIO_ID ?? DEFAULT_SCENARIO_ID;
  const scenario = findScenarioById(scenarios, scenarioId) as TestScenario;

  const chatId = scenario.requires_group
    ? getRequiredEnv("TELEGRAM_CHAT_ID_GROUP")
    : getRequiredEnv("TELEGRAM_CHAT_ID");
  const replyToMessageId = scenario.requires_group ? getRequiredEnv("TELEGRAM_REPLY_TO_MESSAGE_ID") : "";

  const inputs = {
    bot_token: getRequiredEnv("TELEGRAM_BOT_TOKEN"),
    chat_id: chatId,
    message: process.env.LOCAL_MESSAGE ?? scenario.inputs.message,
    reply_to_message_id: process.env.LOCAL_REPLY_TO_MESSAGE_ID ?? replyToMessageId,
    buttons: process.env.LOCAL_BUTTONS ?? scenario.inputs.buttons,
    disable_link_preview: process.env.LOCAL_DISABLE_LINK_PREVIEW ?? scenario.inputs.disable_link_preview,
    attachment: process.env.LOCAL_ATTACHMENT ?? scenario.inputs.attachment,
    attachment_type: process.env.LOCAL_ATTACHMENT_TYPE ?? scenario.inputs.attachment_type,
    attachment_filename: process.env.LOCAL_ATTACHMENT_FILENAME ?? scenario.inputs.attachment_filename,
  };

  for (const [name, value] of Object.entries(inputs)) {
    setActionInput(name, value);
  }

  if (getOptionalEnv("LOCAL_ACTION_DEBUG") === "true") {
    process.env.ACT_SCENARIO_ID = scenario.id;
  }

  console.info(`[local] Running scenario "${scenario.id}" (${scenario.description})`);
  await import("../src/index.ts");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
