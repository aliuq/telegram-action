# Telegram Message Action

用于在 GitHub Actions 工作流中发送 Telegram 消息通知的 Action。

## 功能特点

- 支持发送基本文本消息、按钮消息
- 支持回复特定消息（通过 reply_to_message_id）
- 使用 Node.js 20 运行环境
- 使用 TypeScript 编写，提供更好的类型安全性

## 使用方法

### 基本使用

```yaml
- uses: aliuq/telegram-action@v1
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
    message: "Hello from GitHub Actions!"
```

### 回复特定消息/发送到主题

```yaml
- uses: aliuq/telegram-action@v1
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
    reply_to_message_id: ${{ secrets.TELEGRAM_REPLY_TO_MESSAGE_ID }}
    message: "这是一条回复消息"
```

## 输入参数

| 参数 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| bot_token | Telegram Bot Token | 是 | - |
| chat_id | 目标聊天 ID | 是 | - |
| message | 要发送的消息内容 | 是 | "" |
| reply_to_message_id | 要回复的消息 ID/主题ID | 否 | "" |

## 配置说明

## 开发

```bash
# 安装依赖
pnpm install

# 构建项目
pnpm build

# 本地测试
act -j notification
```

## 许可证

MIT License
