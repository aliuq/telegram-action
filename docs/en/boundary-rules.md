# Boundary Rules

This page is for the combinations that are easy to misread when only looking at examples.

## Message source rules

- only one of `message`, `message_file`, or `message_url` may be set
- at least one content path must exist: a message source, `attachment`, or `attachments`
- `message_url` must start with `http://` or `https://`

## Attachment rules

- `attachment` and `attachments` cannot be used together
- `attachment_type` is required when `attachment` is set
- `attachment_type` and `attachment_filename` cannot be used with `attachments`
- `supports_streaming` requires a single `attachment` with `attachment_type: video`
- inside `attachments`, `supports_streaming` must be a JSON boolean on a video item

## Caption rules

- for a single attachment, `message` becomes the caption only when the formatted text fits Telegram's caption limit
- if it does not fit, the action sends text chunks first and sends the attachment after that
- with `attachments`, top-level `message` never becomes a batch caption and is always sent as text first

## Buttons and long messages

- buttons cannot be sent by themselves
- buttons are attached to the final message chunk only
- when a single attachment uses the caption path, buttons stay on the attachment message if a caption exists

## Attachment batch rules

- one item in `attachments` falls back to the single attachment path
- media groups accept only compatible item types
- `animation` is always sent alone
- per-item captions are validated before the request is sent

## Local file rules

- repository paths are resolved from the workspace root
- `attachment path does not exist` means the path was treated as a local file path and could not be resolved
- `attachment_filename` and batch item `filename` only make sense for local uploads
