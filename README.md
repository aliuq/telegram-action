# Telegram Message Notification Action

A GitHub Action for sending Telegram messages from workflows. It handles plain text, inline buttons, file attachments, replies, topics, and the local test flows used to maintain the project.

For Chinese documentation, see [README.zh-CN.md](./README.zh-CN.md). The English README is the primary source of truth for behavior, inputs, and development notes.

## Features

- Send MarkdownV2-formatted text
- Split long text into a reply chain automatically
- Attach inline keyboard buttons in flat or nested JSON
- Load message text from inline input, local files, or remote URLs
- Send media from local files, public URLs, or Telegram file IDs
- Send multiple items with the `attachments` JSON input
- Reply to an existing message or post into a topic with environment variables
- Control link previews explicitly
- Validate scenarios locally before running live sends
- Run the repository workflow locally with `act`

## Usage

### Prerequisites

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather) and copy the bot token.
2. Find the target chat ID, for example with [@userinfobot](https://t.me/userinfobot).
3. Add the following repository secrets in `Settings -> Secrets and variables -> Actions`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_TOPIC_ID` for topic/thread delivery when needed
   - `TELEGRAM_REPLY_TO_MESSAGE_ID` for replying to a specific existing message when needed

### Basic example

```yaml
- name: Send Telegram Message
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: |
      🚀 A new commit was pushed!

      👤 Actor: ${{ github.actor }}
      📦 Repository: ${{ github.repository }}
      🌿 Ref: ${{ github.ref }}
```

### Message from a local file

```yaml
- name: Send a changelog file
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_file: ".github/telegram/release-note.md"
```

### Message from a remote URL

```yaml
- name: Send release notes from a URL
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_url: "https://example.com/release-notes.md"
```

### Message with buttons

The `buttons` input accepts two JSON shapes.

**Flat format, single row**

```yaml
- name: Send Message with Buttons
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: "See more details"
    buttons: |
      [
        { "text": "View commit", "url": "https://github.com/${{ github.repository }}/commit/${{ github.sha }}" },
        { "text": "Open repository", "url": "https://github.com/${{ github.repository }}" }
      ]
```

**Nested format, multiple rows**

```yaml
buttons: |
  [
    [
      { "text": "View commit", "url": "https://github.com/${{ github.repository }}/commit/${{ github.sha }}" }
    ],
    [
      { "text": "Open repository", "url": "https://github.com/${{ github.repository }}" }
    ]
  ]
```

Each button must contain a `text` field and exactly one Telegram action field such as `url` or `callback_data`.

### Long messages

When a text message exceeds Telegram's limit, the action splits it automatically and sends the chunks in order. Every later chunk replies to the previous chunk so the full message stays connected in the chat history. When buttons are present, they are attached to the final chunk only.

### Streaming response note

Streaming response is being folded back into the main action flow. There is no separate public `telegram-action/stream` entry in the current interface.

The intended direction is straightforward:

- stream-related fields belong to the main action inputs and workflow configuration
- the runtime reads the upstream text stream from the main entry path (`src/index.ts` / `dist/index.js`)
- stream completion is judged by explicit done markers, natural EOF, idle timeout, or max duration
- Telegram draft delivery should keep using `@grammyjs/stream` internally instead of reimplementing `sendMessageDraft`

Until those fields land, the public interface remains the non-streaming inputs documented below.

### Message with attachments

Use `attachment` together with `attachment_type` to send a media or document payload. Local paths are resolved from the workspace root, so repository files can be uploaded directly during the workflow run.

```yaml
- name: Send a local photo
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: "🖼️ Photo attachment"
    attachment: "scripts/fixtures/sample-photo.webp"
    attachment_type: "photo"
```

```yaml
- name: Send a document from a URL
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: "📎 Document attachment"
    attachment: "https://example.com/report.pdf"
    attachment_type: "document"
```

```yaml
- name: Send a video from a URL
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: "🎬 Video attachment"
    attachment: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
    attachment_type: "video"
```

```yaml
- name: Send a video as a file
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: "📎 Video file"
    attachment: "scripts/fixtures/sample-video.mp4"
    attachment_type: "document"
    attachment_filename: "sample-video.mp4"
```

When an attachment is present, the `message` input is sent as the attachment caption.
Use `attachment_type: "document"` whenever you want Telegram to send an image or video as a regular file instead of optimizing it as inline media. The action sets `disable_content_type_detection: true` for uploaded documents so Telegram keeps media files in document mode.

For single video sends, set `supports_streaming: "true"` when you want Telegram to present the video as a streamable media message instead of a generic upload.

### Message with multiple attachments

Use `attachments` when you want to send multiple media items in one action run. Compatible items are grouped with Telegram album semantics, and unsupported mixes are split into multiple batches automatically.

```yaml
- name: Send multiple media items
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: "Build artifacts"
    attachments: |
      [
        {
          "type": "photo",
          "source": "scripts/fixtures/sample-photo.webp",
          "filename": "sample-photo.webp",
          "caption": "Preview image"
        },
        {
          "type": "video",
          "source": "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
        }
      ]
```

With `attachments`, the top-level `message` is sent as a separate text message before the media batches so it can still be split safely and carry inline buttons. Per-item captions can be supplied inside the JSON array.

Boundary behavior:

- 1 item falls back to a normal single attachment send
- 2-10 compatible items are sent in one Telegram media group
- More than 10 items are split into multiple batches automatically, preserving order

### Post in a topic or reply to a message

```yaml
- name: Post in a topic and optionally reply to a message
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
    TELEGRAM_TOPIC_ID: ${{ secrets.TELEGRAM_TOPIC_ID }}
    TELEGRAM_REPLY_TO_MESSAGE_ID: ${{ secrets.TELEGRAM_REPLY_TO_MESSAGE_ID }}
  with:
    message: "Replying inside a topic"
```

### Channel comments

Telegram channel comments are not controlled by a per-message Bot API flag. If your target `TELEGRAM_CHAT_ID` is a channel with a linked discussion group, Telegram will expose comments on the posted message automatically. This action sends the post, but enabling the comment area itself must be configured in Telegram channel settings.

## Required environment variables

| Variable | Description | Required |
|------|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Yes |
| `TELEGRAM_CHAT_ID` | Target Telegram chat, channel, or group ID | Yes |
| `TELEGRAM_TOPIC_ID` | Target topic/thread ID (`message_thread_id`) when posting into a forum topic | No |
| `TELEGRAM_REPLY_TO_MESSAGE_ID` | Reply target message ID when replying to a specific message | No |

## Inputs

| Input | Description | Required | Default |
|------|------|------|--------|
| `message` | Inline message text. Mutually exclusive with `message_file` and `message_url`. For a single attachment it becomes the caption when it fits Telegram's caption limit; with `attachments`, it is sent as a separate text message before the media batches | No | `""` |
| `message_file` | Repository-local UTF-8 text file whose contents become the message body. Mutually exclusive with `message` and `message_url` | No | `""` |
| `message_url` | Remote HTTP(S) URL whose response body becomes the message body. Mutually exclusive with `message` and `message_file` | No | `""` |
| `buttons` | Inline keyboard JSON in flat or nested format | No | `""` |
| `disable_link_preview` | Whether to disable link previews. Accepts only `"true"` or `"false"` | No | `"true"` |
| `attachment` | Local file path, public URL, or Telegram file ID to send as an attachment | No | `""` |
| `attachments` | JSON array for sending multiple attachment items. Each item supports `type`, `source`, optional `filename`, optional `caption`, and optional `supports_streaming` for videos | No | `""` |
| `attachment_type` | Attachment type: `photo`, `video`, `audio`, `animation`, or `document` | No | `""` |
| `attachment_filename` | Optional filename override for local file uploads | No | `""` |
| `supports_streaming` | Enable Telegram streaming mode for single `video` attachments. Accepts only `"true"` or `"false"` | No | `"false"` |

Exactly one of `message`, `message_file`, and `message_url` may be set. You must still provide at least one message source, `attachment`, or `attachments`.
`attachment` and `attachments` are mutually exclusive. When `attachments` is used, do not set `attachment_type` or `attachment_filename`.
For `attachments`, set streaming per item inside the JSON payload with `supports_streaming: true` on video items.

## Outputs

| Output | Description |
|------|------|
| `message_id` | ID of the last sent Telegram message |
| `status` | Execution status, currently `"success"` |

## Code layout

The runtime is split into a few focused modules:

- `src/index.ts`: tiny entry point and top-level error handling
- `src/env.ts`: shared environment variable helpers for the action and local tooling
- `src/inputs.ts`: input reading, validation, and normalization
- `src/messages.ts`: message-source resolution and Telegram-safe text chunking
- `src/stream.ts`: internal streaming helpers used by the main action flow
- `src/attachments.ts`: local file and attachment source resolution
- `src/source-utils.ts`: shared path and URL helpers
- `src/logger.ts`: runtime-aware logging with timestamps for GitHub Actions and local runs
- `src/telegram.ts`: Telegram API request construction and dispatch
- `src/act-logging.ts`: local-only debug logging for `act`

That split keeps the public behavior stable while making the internals easier to work on.

## Local testing

For local work, this order is usually enough:

1. Run `bun run test` to open the local runner.
   If you pass scenario ids or `--all` without `--mode`, the runner will still ask which environment to use, but it will skip the scenario picker because the selection is already known.
2. Run `bun run test:unit` for fast local unit tests with `vitest`.
3. Run `bun run test:validate` when you only want parser-level validation without sending messages.
4. Run `bun run test:act` when you want to execute selected scenarios through `act` against `.github/workflows/test.yaml`.
5. Run raw `act` commands only when you need a fully manual workflow invocation.

### 1. Direct send test

Before running it, create a repository-root `.env` file:

```bash
cat <<'EOF' > .env
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=yyy
TELEGRAM_TOPIC_ID=456
TELEGRAM_REPLY_TO_MESSAGE_ID=123
EOF
```

Then use the direct sender:

```bash
bun run test
bun run test -- buttons-flat
bun run test -- --all
```

Bun automatically loads the repository-root `.env` file for `bun run`, so the sender does not need its own `.env` parser or an explicit `--env-file` flag. Plain `bun run test` opens the interactive runner. If you already know which scenario you want, `bun run test -- <scenarioId>` skips only the scenario picker; you still choose `source`, `act`, or `validate` first. Expected-failure scenarios still count as passing only when they fail for the reason the catalog expects.

### 2. Unified interactive runner

The repository has one local runner built with [@clack/prompts](https://github.com/bombshell-dev/clack). It supports three modes:

- `source`: run the main action entry (`src/index.ts`) directly from the current workspace
- `act`: execute the GitHub Actions workflow locally through `act`
- `validate`: check the scenario catalog without sending messages

Every run stores the exact rerun command plus a log file in `.test-history/`, and the prompt can quickly rerun the previous command. The shared logger adds ISO 8601 timestamps to each emitted line, which makes local reruns, Docker sessions, and saved logs easier to compare.

Before running it, create a repository-root `.env` file:

```bash
cat <<'EOF' > .env
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=yyy
TELEGRAM_TOPIC_ID=456
TELEGRAM_REPLY_TO_MESSAGE_ID=123
EOF
```

```bash
bun run test
bun run test:unit
bun run test:act
bun run test:validate
bun run test -- --all
bun run test:validate -- buttons-flat
```

If you do not pass a mode, the runner asks where you want to run first. When the CLI already includes scenario ids or `--all`, it reuses that selection and skips the scenario prompt. The `act` mode preserves ANSI colors and saves the full colored output to `.test-history/logs/`. In GitHub Actions, logs still use collapsible groups. In plain Node, Docker, or CI-style environments, the runner falls back to timestamped text output and plain summary lines.

During local `act` runs, the action prints an extra debug group with the scenario id, Telegram method, masked chat id, button counts, attachment source kind, and nested error details when a request fails.

The `invalid-buttons` test case is expected to fail because the action rejects malformed button payloads instead of silently skipping them. The `video-url` scenario depends on Telegram being able to fetch the public video URL.

### 3. Direct `act` usage

You can also invoke the bundled workflow directly. The workflow accepts a single `scenario_ids` input and runs the selected scenarios sequentially inside one `notification` job through `scripts/workflow.ts`.

```bash
act workflow_dispatch -n -W .github/workflows/test.yaml -j notification \
  --input scenario_ids=all \
  --secret-file .env
```

To execute it for real, provide the required secrets:

```bash
act workflow_dispatch -W .github/workflows/test.yaml -j notification \
  --input scenario_ids=basic,photo-local,photo-as-document,video-as-document,document-local,video-url \
  --secret-file .env
```

This action uses `node24`, so use a recent version of `act`.

## Troubleshooting

- **`attachment path does not exist`**: use a workspace-relative path such as `scripts/fixtures/sample-photo.webp`, and make sure the file exists in the checked-out repository.
- **`buttons must be valid JSON`**: validate the JSON locally first; every button needs a `text` field plus exactly one Telegram action field.
- **Telegram rejects the message formatting**: start with plain text, then add Markdown gradually so you can see which characters need escaping.
- **Replies or topic posts fail**: confirm that `TELEGRAM_CHAT_ID`, `TELEGRAM_TOPIC_ID`, and `TELEGRAM_REPLY_TO_MESSAGE_ID` all belong to the same chat/thread context, and only set the variables you actually need.

## Workflow file used in this repository

The repository's test workflow lives at [.github/workflows/test.yaml](.github/workflows/test.yaml).

## License

MIT
