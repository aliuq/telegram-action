import type { Bot, InputFile } from 'grammy';
import type {
  InlineKeyboardMarkup,
  InputMediaAudio,
  InputMediaDocument,
  InputMediaPhoto,
  InputMediaVideo,
} from 'grammy/types';

export type AttachmentType =
  | 'photo'
  | 'video'
  | 'audio'
  | 'animation'
  | 'document';

/**
 * Shared Telegram attachment option surface used by all supported senders.
 */
export interface AttachmentSendOptions {
  caption?: string;
  parse_mode?: 'MarkdownV2';
  reply_markup?: InlineKeyboardMarkup;
  message_thread_id?: number;
  reply_parameters?: { message_id: number };
  disable_content_type_detection?: boolean;
  supports_streaming?: boolean;
}

/**
 * Common sender signature used to dispatch supported attachment requests.
 */
export type AttachmentSender = (
  bot: Bot,
  chatId: string,
  source: InputFile | string,
  options: AttachmentSendOptions,
) => Promise<{ message_id: number }>;

/**
 * Raw values read from the GitHub Actions input boundary.
 *
 * All action inputs arrive as strings at this stage, before validation and
 * normalization happen in the parser.
 */
export interface RawActionInputs {
  scenarioId?: string;
  botToken: string;
  chatId: string;
  message: string;
  messageFile: string;
  messageUrl: string;
  streamResponse: string;
  buttons: string;
  topicId: string;
  replyToMessageId: string;
  disableLinkPreview: string;
  attachment: string;
  attachments: string;
  attachmentType: string;
  attachmentFilename: string;
  supportsStreaming: string;
}

/**
 * Resolved attachment payload after the source string has been interpreted.
 */
export interface ResolvedAttachmentSource {
  value: InputFile | string;
  isLocalFile: boolean;
}

/**
 * Normalized action request after parsing, validation, and type coercion.
 */
export interface ParsedActionInputs {
  scenarioId?: string;
  botToken: string;
  chatId: string;
  message?: string;
  streamResponse: boolean;
  disableLinkPreview: boolean;
  topicId?: number;
  replyMessageId?: number;
  replyMarkup?: InlineKeyboardMarkup;
  attachmentType?: AttachmentType;
  attachmentSource?: ResolvedAttachmentSource;
  attachmentItems?: ParsedAttachmentItem[];
  supportsStreaming: boolean;
}

/**
 * Raw attachment item shape accepted by the `attachments` JSON input.
 */
export interface RawAttachmentItemInput {
  type: AttachmentType;
  source: string;
  filename?: string;
  caption?: string;
  supports_streaming?: boolean;
}

/**
 * Parsed attachment item ready for single-send or media-group transport.
 */
export interface ParsedAttachmentItem {
  type: AttachmentType;
  source: ResolvedAttachmentSource;
  filename?: string;
  caption?: string;
  supportsStreaming?: boolean;
}

export type TelegramMediaGroupItem =
  | InputMediaAudio
  | InputMediaDocument
  | InputMediaPhoto
  | InputMediaVideo;

/**
 * Raw scenario input shape used by local tooling and workflow helpers.
 */
export interface ScenarioInputs {
  message: string;
  message_file: string;
  message_url: string;
  stream_response: string;
  disable_link_preview: string;
  buttons: string;
  attachment: string;
  attachments: string;
  attachment_type: string;
  attachment_filename: string;
  supports_streaming: string;
}

/**
 * Single test scenario definition.
 */
export interface ScenarioDefinition {
  id: string;
  description: string;
  expect_failure: boolean;
  inputs: ScenarioInputs;
}

/**
 * Concrete scenario selection after parsing the workflow or local-runner input.
 */
export interface ScenarioSelection {
  runAll: boolean;
  scenarioIds: string[];
  selectedScenarios: ScenarioDefinition[];
}

/**
 * GitHub Actions matrix payload used by the integration workflow job fan-out.
 */
export interface WorkflowScenarioMatrix {
  include: Array<{ scenario_id: string }>;
}

/**
 * Supported execution modes for the local runner.
 */
export type TestMode = 'source' | 'act' | 'validate';

/**
 * Raw CLI options before interactive prompts fill in missing selections.
 */
export interface CliOptions {
  mode?: TestMode;
  runAll: boolean;
  rerunLast: boolean;
  scenarioIds: string[];
}

/**
 * Fully resolved runner selection after CLI parsing and prompt handling.
 */
export interface TestSelection {
  mode: TestMode;
  runAll: boolean;
  scenarioIds: string[];
}

/**
 * One persisted test-run history record.
 */
export interface TestHistoryEntry extends TestSelection {
  command: string;
  createdAt: string;
  logFile?: string;
  durationMs?: number;
  durationText?: string;
}

/**
 * History state saved by the interactive runner.
 */
export interface TestHistoryState {
  lastRun?: TestHistoryEntry;
  runs: TestHistoryEntry[];
}

/**
 * Convenience alias for Telegram's nested inline-keyboard structure.
 */
export type InlineKeyboardMatrix = InlineKeyboardMarkup['inline_keyboard'];

/**
 * Data shown in local request previews and failure diagnostics.
 */
export interface ActRequestSummaryOptions {
  scenarioId?: string;
  method: string;
  chatId: string;
  message?: string;
  disableLinkPreview: boolean;
  topicId?: number;
  replyMessageId?: number;
  replyMarkup?: InlineKeyboardMarkup;
  attachmentType?: AttachmentType;
  attachmentSource?: ResolvedAttachmentSource;
}
