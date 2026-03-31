# Reference

## Environment variables

| Variable | Description | Required |
|------|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Yes |
| `TELEGRAM_CHAT_ID` | Target Telegram chat, channel, or group ID | Yes |
| `TELEGRAM_TOPIC_ID` | Topic or thread ID for forum delivery | No |
| `TELEGRAM_REPLY_TO_MESSAGE_ID` | Existing message ID to reply to | No |

## Inputs

| Input | Description | Default |
|------|------|------|
| `message` | Inline message text | `""` |
| `message_file` | Repository-local UTF-8 text file | `""` |
| `message_url` | Remote HTTP(S) URL | `""` |
| `buttons` | Flat or nested inline keyboard JSON | `""` |
| `disable_link_preview` | Link preview toggle, accepts only `"true"` or `"false"` | `"true"` |
| `attachment` | Single attachment source | `""` |
| `attachments` | JSON array of attachment items | `""` |
| `attachment_type` | Single attachment type | `""` |
| `attachment_filename` | Local filename override for one attachment | `""` |
| `supports_streaming` | Streaming mode for a single video attachment | `"false"` |

## Attachment item shape

Each `attachments` item accepts:

| Field | Description |
|------|------|
| `type` | `photo`, `video`, `audio`, `animation`, or `document` |
| `source` | local path, public URL, or Telegram file ID |
| `filename` | optional local upload filename override |
| `caption` | optional per-item caption |
| `supports_streaming` | optional boolean for video items |

## Outputs

| Output | Description |
|------|------|
| `message_id` | ID of the last Telegram message sent in the run |
| `status` | Current execution status, fixed to `"success"` |

## Input matrix

| Combination | Result |
|------|------|
| `message` + `message_file` | invalid |
| `message` + `message_url` | invalid |
| `message_file` + `message_url` | invalid |
| `attachment` + `attachments` | invalid |
| `attachment` + `attachment_type` | valid |
| `attachment` without `attachment_type` | invalid |
| `attachments` + `attachment_type` | invalid |
| `attachments` + `attachment_filename` | invalid |
| `supports_streaming` + single `attachment_type: video` | valid |
| `supports_streaming` + non-video single attachment | invalid |
| `supports_streaming` + `attachments` | invalid at the top level |

## Request limits and validation notes

- `message_url` is fetched with an HTTP(S) requirement and a 30 second timeout
- caption text is validated after formatting
- long text is split before sending
- MarkdownV2 parse failures fall back to plain text for that chunk instead of failing the whole run
