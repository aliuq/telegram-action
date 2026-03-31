# 快速开始

## 这套 Action 需要的最小输入

- 一个 Telegram bot token
- 一个目标 chat ID
- 一种内容来源，也就是 `message`、`message_file`、`message_url` 三选一
- 只有在话题投递或回复时，才需要额外的路由字段

## 最小工作流

```yaml
- name: Send Telegram message
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: Build finished successfully
```

## 准备清单

1. 通过 [@BotFather](https://t.me/BotFather) 创建 bot
2. 把 token 放进 `TELEGRAM_BOT_TOKEN`
3. 查出目标 chat ID，放进 `TELEGRAM_CHAT_ID`
4. 只有发论坛话题时才设置 `TELEGRAM_TOPIC_ID`
5. 只有回复现有消息时才设置 `TELEGRAM_REPLY_TO_MESSAGE_ID`

## 第一轮判断

- 工作流里直接拼正文，用 `message`
- 仓库里已经有 Markdown 或文本文件，用 `message_file`
- 正文在外部地址上，用 `message_url`
- 只发一个媒体条目，用 `attachment` 和 `attachment_type`
- 一次发多个媒体条目，用 `attachments`

## 下一步

- 发送示例和路径选择： [send-patterns.md](./send-patterns.md)
- 容易踩坑的组合： [boundary-rules.md](./boundary-rules.md)
- 字段速查： [reference.md](./reference.md)
