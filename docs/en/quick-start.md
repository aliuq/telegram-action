# Quick Start

## What this action expects

- a Telegram bot token
- a target chat ID
- one content source: `message`, `message_file`, or `message_url`
- optional routing fields for topics and replies

## Minimal workflow

```yaml
- name: Send Telegram message
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: Build finished successfully
```

## Setup checklist

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Store the token in `TELEGRAM_BOT_TOKEN`
3. Resolve the target chat ID and store it in `TELEGRAM_CHAT_ID`
4. Add `TELEGRAM_TOPIC_ID` only for forum topics
5. Add `TELEGRAM_REPLY_TO_MESSAGE_ID` only when a reply target already exists

## First decisions to make

- Need to send text from the workflow itself: use `message`
- Need to reuse a file committed in the repository: use `message_file`
- Need to relay content from elsewhere: use `message_url`
- Need one media item: use `attachment` with `attachment_type`
- Need multiple media items: use `attachments`

## Next pages

- Sending examples by path: [send-patterns.md](./send-patterns.md)
- Input combinations to avoid: [boundary-rules.md](./boundary-rules.md)
- Full field reference: [reference.md](./reference.md)
