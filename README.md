# Telegram Message Notification Action

一个用于发送 Telegram 消息通知的 GitHub Action。支持基本消息发送和自定义按钮功能。

## 功能特点

- 发送基本文本消息
- 支持 Markdown 格式
- 支持自定义按钮
- 支持话题回复

## 使用方法

### 基本配置

1. 获取 Telegram Bot Token （从 [@BotFather](https://t.me/BotFather) 获取）
2. 获取 Chat ID （可以使用 [@userinfobot](https://t.me/userinfobot) 获取）
3. 在仓库的 Settings -> Secrets -> Actions 中添加以下 secrets：
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_REPLY_TO_MESSAGE_ID`（可选，用于话题回复）

### 基本用法

```yaml
- name: Send Telegram Message
  uses: aliuq/telegram-action@main
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
    message: |
      🚀 新的提交已推送!
      
      👤提交人: ${{ github.actor }}
      📦仓库: ${{ github.repository }}
      🌿分支: ${{ github.ref }}
```

### 带按钮的消息

```yaml
- name: Send Message with Buttons
  uses: aliuq/telegram-action@main
  with:
    bot_token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    chat_id: ${{ secrets.TELEGRAM_CHAT_ID }}
    message: "查看更多信息"
    buttons: |
      [
        [
          { "text": "查看提交", "url": "https://github.com/${{ github.repository }}/commit/${{ github.sha }}" }
        ]
      ]
```

## 输入参数

| 参数 | 描述 | 必填 | 默认值 |
|------|------|------|--------|
| `bot_token` | Telegram Bot Token | 是 | - |
| `chat_id` | Telegram Chat ID | 是 | - |
| `message` | 要发送的消息内容 | 是 | "" |
| `reply_to_message_id` | 要回复的消息 ID（用于话题功能） | 否 | "" |
| `buttons` | 按钮配置的 JSON 字符串 | 否 | "" |

## 输出参数

| 参数 | 描述 |
|------|------|
| `message_id` | 发送成功后的消息 ID |

## 完整示例

请参考 [.github/workflows/run.yaml](.github/workflows/run.yaml) 中的示例。

## 许可证

MIT License
