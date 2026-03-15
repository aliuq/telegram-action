# Telegram Message Notification Action

A GitHub Action for sending Telegram notifications. It supports standard messages, inline buttons, media and document attachments, replies to existing messages, and local validation with `act`.

## Features

- Send plain text messages with MarkdownV2 formatting
- Send inline keyboard buttons using flat or nested JSON
- Send media and documents from local files, public URLs, or Telegram file IDs
- Send video messages through the shared attachment interface
- Reply to an existing message, including topic starter messages
- Enable or disable link previews explicitly
- Run example workflows locally with `act`

## Usage

### Prerequisites

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather) and copy the bot token.
2. Find the target chat ID, for example with [@userinfobot](https://t.me/userinfobot).
3. Add the following repository secrets in `Settings -> Secrets and variables -> Actions`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_CHAT_ID_GROUP` for group or topic tests
   - `TELEGRAM_REPLY_TO_MESSAGE_ID` for topic or threaded replies

### Basic example

```yaml
- name: Send Telegram Message
  uses: aliuq/telegram-action@master
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
    message: |
      🚀 A new commit was pushed!

      👤 Actor: ${{ github.actor }}
      📦 Repository: ${{ github.repository }}
      🌿 Ref: ${{ github.ref }}
```

### Message with buttons

The `buttons` input accepts two JSON shapes.

**Flat format, single row**

```yaml
- name: Send Message with Buttons
  uses: aliuq/telegram-action@master
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
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

### Message with attachments

Use `attachment` together with `attachment_type` to send a media or document payload. Local paths are resolved from the workspace root, so repository files can be uploaded directly during the workflow run.

```yaml
- name: Send a local photo
  uses: aliuq/telegram-action@master
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
    message: "🖼️ Photo attachment"
    attachment: "scripts/fixtures/sample-photo.png"
    attachment_type: "photo"
```

```yaml
- name: Send a document from a URL
  uses: aliuq/telegram-action@master
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
    message: "📎 Document attachment"
    attachment: "https://example.com/report.pdf"
    attachment_type: "document"
```

```yaml
- name: Send a video from a URL
  uses: aliuq/telegram-action@master
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
    message: "🎬 Video attachment"
    attachment: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
    attachment_type: "video"
```

When an attachment is present, the `message` input is sent as the attachment caption. Video attachments can use the same local path, URL, and Telegram `file_id` flow as the other attachment types.

### Reply to a message or topic

```yaml
- name: Reply in a topic
  uses: aliuq/telegram-action@master
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID_GROUP }}
    reply_to_message_id: ${{ secrets.TELEGRAM_REPLY_TO_MESSAGE_ID }}
    message: "Replying inside a topic"
```

## Inputs

| Input | Description | Required | Default |
|------|------|------|--------|
| `bot_token` | Telegram bot token | Yes | - |
| `chat_id` | Telegram chat ID | Yes | - |
| `message` | Message text sent with MarkdownV2 formatting. Used as the caption when an attachment is sent | No | `""` |
| `reply_to_message_id` | Message ID to reply to | No | `""` |
| `buttons` | Inline keyboard JSON in flat or nested format | No | `""` |
| `disable_link_preview` | Whether to disable link previews. Accepts only `"true"` or `"false"` | No | `"true"` |
| `attachment` | Local file path, public URL, or Telegram file ID to send as an attachment | No | `""` |
| `attachment_type` | Attachment type: `photo`, `video`, `audio`, `animation`, or `document` | No | `""` |
| `attachment_filename` | Optional filename override for local file uploads | No | `""` |

## Outputs

| Output | Description |
|------|------|
| `message_id` | ID of the sent Telegram message |
| `status` | Execution status, currently `"success"` |

## Local testing

### Fast local development without `act`

For quick iteration, you can run the action logic directly with Bun instead of booting a full GitHub Actions job.

Create a local env file first:

```bash
cat <<'EOF' > .env.local
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=yyy
TELEGRAM_CHAT_ID_GROUP=zzz
TELEGRAM_REPLY_TO_MESSAGE_ID=123
EOF
```

Then load it into your shell and run one of the shared scenarios directly:

```bash
set -a && source ./.env.local && set +a
bun run local basic
```

You can pick any id from `scripts/scenarios.json`:

```bash
bun run local buttons-flat
bun run local document-local
```

For rapid iteration, override only the fields you are changing:

```bash
LOCAL_MESSAGE=$'🚀 Fast local dev\n\nTweaking message rendering' bun run local basic
LOCAL_BUTTONS='[{"text":"GitHub","url":"https://github.com"}]' bun run local basic
LOCAL_ATTACHMENT='scripts/fixtures/sample-document.txt' LOCAL_ATTACHMENT_TYPE='document' bun run local basic
```

If you want automatic reruns while editing, use Bun watch mode:

```bash
set -a && source ./.env.local && set +a
bun run local:watch basic
```

The local runner maps the friendly `TELEGRAM_*` variables to the action's `INPUT_*` environment variables, reuses `scripts/scenarios.json`, and imports `src/index.ts` directly, so you can test logic changes without rebuilding the full `act` environment.

For local mock servers or network debugging, the action also honors an optional `TELEGRAM_API_ROOT` environment variable when run directly.

### Interactive manual runner

The repository includes a small interactive runner built with [@clack/prompts](https://github.com/bombshell-dev/clack). It reuses `.github/workflows/run.yaml`, reads shared scenario definitions from `scripts/scenarios.json`, and runs the existing `notification` job through `act`.

Before running it, create a repository-root `.env` file for `act`:

```bash
cat <<'EOF' > .env
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=yyy
TELEGRAM_CHAT_ID_GROUP=zzz
TELEGRAM_REPLY_TO_MESSAGE_ID=123
EOF
```

```bash
bun run test:interactive
```

The runner first lets you choose between manual selection and a one-click "select all" path. Manual mode starts with no scenarios selected, and the multi-select prompt then uses `space` to toggle items and `enter` to confirm. Before execution, it prints the full `act` command, asks for one more confirmation, and then streams the live `act` logs directly to the terminal. When you select only part of the catalog, the runner also adds `act --matrix scenario_id:...` filters so it does not expand the entire workflow matrix.

During local `act` runs, the action also prints an extra debug group with the scenario id, Telegram method, masked chat id, button counts, attachment source kind, and nested network error details when a request fails.

The `invalid-buttons` test case is expected to fail because the action now rejects malformed button payloads instead of silently skipping them. The `video-url` scenario depends on Telegram being able to fetch the public video URL.

The repository lint step also verifies that the workflow matrix scenario ids stay in sync with `scripts/scenarios.json`, which helps keep the scenario catalog as the primary source of truth.

### Running the example workflow with `act`

You can dry-run the bundled workflow locally. The workflow accepts a single `scenario_ids` input, so you can run all scenarios or a comma-separated subset while keeping the scenario catalog in one place.

```bash
act workflow_dispatch -n -W .github/workflows/run.yaml -j notification \
  --input scenario_ids=all \
  --secret-file .env
```

To execute it for real, provide the required secrets:

```bash
act workflow_dispatch -W .github/workflows/run.yaml -j notification \
  --input scenario_ids=basic,photo-local,document-local,video-url \
  --secret-file .env
```

This action uses `node24`, so use a recent version of `act`.

## Full example workflow

See [.github/workflows/run.yaml](.github/workflows/run.yaml) for the full integration example used by the repository.

## License

MIT
