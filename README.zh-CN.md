# Telegram Message Notification Action

一个用于发送 Telegram 消息通知的 GitHub Action

支持普通文本、MarkdownV2、按钮、本地和远程正文来源、单附件、多媒体批量发送、话题投递、回复消息，以及本地测试流程

## 功能特点

- 发送普通文本和 MarkdownV2 消息
- 超长文本自动拆成回复链
- 按钮支持 flat 和 nested 两种 JSON 结构
- 正文支持内联文本、仓库文件、远程 URL
- 支持本地文件、公开 URL、Telegram file_id 附件
- 支持通过 `attachments` 一次发送多个媒体条目
- 支持发到话题里，或者回复一条已有消息

## 使用方法

### 基本配置

1. 通过 [@BotFather](https://t.me/BotFather) 创建 Telegram bot 并拿到 token
2. 通过 [@userinfobot](https://t.me/userinfobot) 之类的工具查出目标 chat ID
3. 在仓库 `Settings -> Secrets and variables -> Actions` 里配置这些 secrets：
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_TOPIC_ID`，发送到群组的话题 ID
   - `TELEGRAM_REPLY_TO_MESSAGE_ID`，回复已有消息时使用

### 基本用法

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

### 从仓库文件读取正文

```yaml
- name: Send release note file
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_file: .github/telegram/release-note.md
```

### 从远程 URL 读取正文

```yaml
- name: Send release notes from a URL
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_url: https://example.com/release-notes.md
```

### 超长消息

格式化后的消息超过 Telegram 限制时，Action 会自动拆分，后面的每一段都会回复前一段，按钮只会挂在最后一段上

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

### 带按钮的消息

`buttons` 接受两种结构：

- flat 数组，表示单行
- nested 数组，表示多行

每个按钮都必须带 `text`，同时只能带一个 Telegram 行为字段，例如 `url` 或 `callback_data`

单行示例：

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

多行示例：

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

### 单个附件

单附件使用 `attachment` 配合 `attachment_type`

本地图片：

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

远程文档：

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

视频按普通文件发送：

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

单个视频启用流媒体模式：

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

单附件场景里，`message` 只有在格式化后还放得进 caption 限制时，才会直接作为 caption 发送，否则会先发文本，再发附件

### 一次发送多个附件

多个媒体条目一起发送时，使用 `attachments`

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

批次规则如下：

- 1 个条目会退回单附件路径
- 2 到 10 个兼容条目会组成一个 media group
- 超过 10 个条目会按顺序拆成多个批次
- `animation` 不能进入 media group，所以会单独发送

使用 `attachments` 时，顶层 `message` 会先作为普通文本消息发出，这样长文本还能继续拆分，按钮也还能挂在文本消息上

### 发到话题里，或者回复一条消息

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

### 频道评论区

频道评论区由 Telegram 自己控制，目标频道如果已经绑定 discussion group，消息发出去后 Telegram 会自动显示评论入口
对于频道目标，Action 会跳过 typing indicator，因为 Telegram 不支持在那里调用 `sendChatAction`

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | 是 |
| `TELEGRAM_CHAT_ID` | 目标 Telegram 聊天、频道或群组 ID | 是 |
| `TELEGRAM_TOPIC_ID` | 目标话题或线程 ID，也就是 `message_thread_id` | 否 |
| `TELEGRAM_REPLY_TO_MESSAGE_ID` | 回复目标消息 ID | 否 |

## 输入参数

| 参数 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `message` | 内联消息正文，和 `message_file`、`message_url` 互斥 | 否 | `""` |
| `message_file` | workspace 内的 UTF-8 文本文件，文件内容会变成消息正文 | 否 | `""` |
| `message_url` | 公网 HTTP(S) URL，响应体会变成消息正文 | 否 | `""` |
| `buttons` | flat 或 nested 结构的按钮 JSON | 否 | `""` |
| `disable_link_preview` | 链接预览开关，只接受 `"true"` 或 `"false"` | 否 | `"true"` |
| `attachment` | 本地路径、公开 URL 或 Telegram file ID | 否 | `""` |
| `attachments` | 多媒体条目 JSON 数组，每项支持 `type`、`source`、可选 `filename`、可选 `caption`、视频可选 `supports_streaming` | 否 | `""` |
| `attachment_type` | `photo`、`video`、`audio`、`animation`、`document` 之一 | 否 | `""` |
| `attachment_filename` | 单附件本地上传时的可选文件名覆盖 | 否 | `""` |
| `supports_streaming` | 单个 `video` 附件的 Telegram 流媒体模式，只接受 `"true"` 或 `"false"` | 否 | `"false"` |

## 输出参数

| 输出 | 说明 |
|------|------|
| `message_id` | 本次运行里最后一条 Telegram 消息的 ID |
| `status` | 当前执行状态，固定为 `"success"` |

## 重要规则

- `message`、`message_file`、`message_url` 只能设置一个
- 消息来源、`attachment`、`attachments` 至少要有一项
- `attachment` 和 `attachments` 不能同时使用
- 使用 `attachment` 时必须带 `attachment_type`
- `attachments` 不能再搭配 `attachment_type` 或 `attachment_filename`
- 顶层 `supports_streaming` 只对单个 `video` 附件有效
- `attachments` 里的 `supports_streaming` 要写在视频条目本身上
- `message_file` 和本地 `attachment` 路径必须留在 `GITHUB_WORKSPACE` / 当前 workspace 内
- `message_url` 必须解析到公网主机；`localhost`、私网 / link-local IP，以及重定向都会被拒绝
- MarkdownV2 某个分片解析失败时，会退回纯文本，而不是让整次发送直接失败

## 更多文档

- 中文文档总览： [docs/zh-CN/README.md](./docs/zh-CN/README.md)
- English docs： [docs/en/README.md](./docs/en/README.md)
- 边界规则： [docs/zh-CN/boundary-rules.md](./docs/zh-CN/boundary-rules.md)
- 参数与输出： [docs/zh-CN/reference.md](./docs/zh-CN/reference.md)
- 本地测试： [docs/zh-CN/local-testing.md](./docs/zh-CN/local-testing.md)

## License

MIT
