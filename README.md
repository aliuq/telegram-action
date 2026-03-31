# Telegram Message Notification Action

A GitHub Action for sending Telegram messages from workflows.

It supports plain text, MarkdownV2 formatting, inline buttons, local and remote message sources, single attachments, multi-item media batches, topic delivery, replies, and local test flows.

## Features

- send plain text and MarkdownV2 messages
- split long messages into a reply chain automatically
- attach inline keyboard buttons in flat or nested JSON
- load message text from inline input, local files, or remote URLs
- send media from local files, public URLs, or Telegram file IDs
- send multiple media items with the `attachments` JSON input
- post into a topic or reply to an existing message
- validate scenarios locally before running live sends

## Usage

### Basic setup

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather) and copy the bot token.
2. Resolve the target chat ID, for example with [@userinfobot](https://t.me/userinfobot).
3. Add these repository secrets in `Settings -> Secrets and variables -> Actions`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_TOPIC_ID` when posting into a forum topic
   - `TELEGRAM_REPLY_TO_MESSAGE_ID` when replying to an existing message

### Basic example

```yaml
- name: Send Telegram message
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: |
      🚀 A new commit was pushed

      Actor: ${{ github.actor }}
      Repository: ${{ github.repository }}
      Ref: ${{ github.ref }}
```

### Message from a repository file

```yaml
- name: Send release note file
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_file: .github/telegram/release-note.md
```

### Message from a remote URL

```yaml
- name: Send release notes from a URL
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_url: https://example.com/release-notes.md
```

### Long messages

When the formatted message exceeds Telegram's message limit, the action splits it automatically and sends every later chunk as a reply to the previous one. Buttons, when present, are attached to the final chunk only.

```yaml
- name: Send a long build report
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_file: .github/telegram/long-report.md
    buttons: |
      [{ "text": "Open workflow", "url": "https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}" }]
```

### Message with buttons

The `buttons` input accepts two JSON shapes:

- flat array for a single row
- nested array for multiple rows

Each button must include `text` and exactly one Telegram action field such as `url` or `callback_data`.

Single row:

```yaml
- name: Send buttons in one row
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: See more details
    buttons: |
      [
        { "text": "View commit", "url": "https://github.com/${{ github.repository }}/commit/${{ github.sha }}" },
        { "text": "Open repository", "url": "https://github.com/${{ github.repository }}" }
      ]
```

Multiple rows:

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

### Single attachment

Use `attachment` together with `attachment_type`.

Local photo:

```yaml
- name: Send a local photo
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: Build preview
    attachment: scripts/fixtures/sample-photo.webp
    attachment_type: photo
```

Remote document:

```yaml
- name: Send a report document
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: Nightly report
    attachment: https://example.com/report.pdf
    attachment_type: document
```

Video as a file:

```yaml
- name: Send a video as a file
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: Raw video artifact
    attachment: scripts/fixtures/sample-video.mp4
    attachment_type: document
    attachment_filename: sample-video.mp4
```

Single video with streaming mode:

```yaml
- name: Send a streamable video
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: Video preview
    attachment: https://samplelib.com/lib/preview/mp4/sample-5s.mp4
    attachment_type: video
    supports_streaming: "true"
```

For a single attachment, `message` becomes the caption only when the formatted text still fits Telegram's caption limit. Otherwise the action sends the text first and the attachment after that.

### Multiple attachments

Use `attachments` when several items should be sent in one run. Compatible items are grouped into Telegram media groups automatically.

```yaml
- name: Send multiple media items
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: Build artifacts
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

Batch behavior:

- 1 item falls back to the single attachment path
- 2 to 10 compatible items are sent as one media group
- more than 10 items are split into multiple batches in order
- `animation` is sent on its own because Telegram does not support it inside media groups

With `attachments`, top-level `message` is sent first as a normal text message. That keeps long text splittable and still allows buttons on the text message.

### Topic post or reply

```yaml
- name: Post in a topic and reply to a message
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
    TELEGRAM_TOPIC_ID: ${{ secrets.TELEGRAM_TOPIC_ID }}
    TELEGRAM_REPLY_TO_MESSAGE_ID: ${{ secrets.TELEGRAM_REPLY_TO_MESSAGE_ID }}
  with:
    message: Replying inside a topic
```

### Channel comments

Telegram channel comments are controlled in Telegram itself. If the target channel is linked to a discussion group, Telegram exposes comments automatically after the post is sent.

## Required environment variables

| Variable | Description | Required |
|------|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Yes |
| `TELEGRAM_CHAT_ID` | Target Telegram chat, channel, or group ID | Yes |
| `TELEGRAM_TOPIC_ID` | Target topic or thread ID, also known as `message_thread_id` | No |
| `TELEGRAM_REPLY_TO_MESSAGE_ID` | Reply target message ID | No |

## Inputs

| Input | Description | Required | Default |
|------|------|------|--------|
| `message` | Inline message text. Mutually exclusive with `message_file` and `message_url` | No | `""` |
| `message_file` | UTF-8 text file inside the workspace whose contents become the message body | No | `""` |
| `message_url` | Public HTTP(S) URL whose response body becomes the message body | No | `""` |
| `buttons` | Inline keyboard JSON in flat or nested format | No | `""` |
| `disable_link_preview` | Link preview toggle. Accepts only `"true"` or `"false"` | No | `"true"` |
| `attachment` | Local file path, public URL, or Telegram file ID | No | `""` |
| `attachments` | JSON array for multi-item sends. Each item supports `type`, `source`, optional `filename`, optional `caption`, and optional `supports_streaming` for videos | No | `""` |
| `attachment_type` | One of `photo`, `video`, `audio`, `animation`, or `document` | No | `""` |
| `attachment_filename` | Optional filename override for a local single attachment | No | `""` |
| `supports_streaming` | Telegram streaming mode for a single `video` attachment. Accepts only `"true"` or `"false"` | No | `"false"` |

## Outputs

| Output | Description |
|------|------|
| `message_id` | Last Telegram message id produced by the run |
| `status` | Execution status, currently `"success"` |

## Important behavior notes

- exactly one of `message`, `message_file`, and `message_url` may be set
- at least one message source, `attachment`, or `attachments` must be provided
- `attachment` and `attachments` are mutually exclusive
- `attachment_type` is required when `attachment` is used
- `attachment_type` and `attachment_filename` cannot be used with `attachments`
- top-level `supports_streaming` works only with a single `video` attachment
- inside `attachments`, `supports_streaming` must be set on the video item itself
- `message_file` and local `attachment` paths must stay inside `GITHUB_WORKSPACE` / the current workspace
- `message_url` must resolve to a public host; localhost, private/link-local IPs, and redirects are rejected
- MarkdownV2 parse failures fall back to plain text for that chunk instead of failing the whole run

## More docs

- English docs hub: [docs/en/README.md](./docs/en/README.md)
- Chinese docs hub: [docs/zh-CN/README.md](./docs/zh-CN/README.md)
- Boundary rules: [docs/en/boundary-rules.md](./docs/en/boundary-rules.md)
- Field reference: [docs/en/reference.md](./docs/en/reference.md)
- Local testing: [docs/en/local-testing.md](./docs/en/local-testing.md)

## License

MIT
