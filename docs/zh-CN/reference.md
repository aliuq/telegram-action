# 参数与输出

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | 是 |
| `TELEGRAM_CHAT_ID` | 目标 Telegram 聊天、频道或群组 ID | 是 |
| `TELEGRAM_TOPIC_ID` | 论坛话题或线程 ID | 否 |
| `TELEGRAM_REPLY_TO_MESSAGE_ID` | 现有消息的回复目标 ID | 否 |

## 输入参数

| 参数 | 说明 | 默认值 |
|------|------|------|
| `message` | 内联消息正文 | `""` |
| `message_file` | 仓库内 UTF-8 文本文件 | `""` |
| `message_url` | 远程 HTTP(S) URL | `""` |
| `buttons` | flat 或 nested 按钮 JSON | `""` |
| `disable_link_preview` | 链接预览开关，只接受 `"true"` 或 `"false"` | `"true"` |
| `attachment` | 单附件来源 | `""` |
| `attachments` | 附件条目 JSON 数组 | `""` |
| `attachment_type` | 单附件类型 | `""` |
| `attachment_filename` | 单附件本地文件名覆盖 | `""` |
| `supports_streaming` | 单个视频附件的流媒体模式 | `"false"` |

## attachments 条目结构

每个 `attachments` 条目支持这些字段：

| 字段 | 说明 |
|------|------|
| `type` | `photo`、`video`、`audio`、`animation`、`document` |
| `source` | 本地路径、公开 URL 或 Telegram file ID |
| `filename` | 可选，本地上传文件名覆盖 |
| `caption` | 可选，单条媒体说明 |
| `supports_streaming` | 可选，只给视频条目使用 |

## 输出参数

| 输出 | 说明 |
|------|------|
| `message_id` | 本次运行里最后一条 Telegram 消息的 ID |
| `status` | 当前执行状态，固定为 `"success"` |

## 输入矩阵

| 组合 | 结果 |
|------|------|
| `message` + `message_file` | 非法 |
| `message` + `message_url` | 非法 |
| `message_file` + `message_url` | 非法 |
| `attachment` + `attachments` | 非法 |
| `attachment` + `attachment_type` | 合法 |
| 只有 `attachment`，没有 `attachment_type` | 非法 |
| `attachments` + `attachment_type` | 非法 |
| `attachments` + `attachment_filename` | 非法 |
| `supports_streaming` + 单个 `attachment_type: video` | 合法 |
| `supports_streaming` + 非视频单附件 | 非法 |
| 顶层 `supports_streaming` + `attachments` | 非法 |

## 校验和限制

- `message_url` 只接受 HTTP(S)，请求超时 30 秒
- caption 长度会在格式化后再校验
- 长文本会在发送前先拆分
- 某个分片如果触发 MarkdownV2 解析失败，会回退到纯文本，而不是让整次运行直接失败
