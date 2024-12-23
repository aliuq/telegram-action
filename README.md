# Telegram Message Action

用于在 GitHub Actions 工作流中发送 Telegram 消息通知的 Action。

## 功能特点

- 支持发送基本文本消息
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

### 1. 创建 Telegram Bot

1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 命令
3. 按照提示完成 bot 创建
4. 保存得到的 bot token

### 2. 获取 Chat ID

- 对于个人对话：
  1. 发送消息给 [@userinfobot](https://t.me/userinfobot)
  2. 获取返回的 ID

- 对于群组：
  1. 将机器人添加到群组
  2. 访问 `https://api.telegram.org/bot<YourBOTToken>/getUpdates`
  3. 在返回的 JSON 中找到 `chat.id`

### 3. 配置 GitHub Secrets

在你的 GitHub 仓库中添加以下 secrets：

1. `TELEGRAM_BOT_TOKEN`: 你的 bot token
2. `TELEGRAM_CHAT_ID`: 目标聊天 ID

## 示例工作流

```yaml
name: Telegram Notification

on:
  push:
    branches: [ main ]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: aliuq/telegram-action@v1
        with:
          bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
          message: |
            📦 新的提交已推送!
            
            提交者: ${{ github.actor }}
            分支: ${{ github.ref }}
            提交信息: ${{ github.event.head_commit.message }}
```

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
