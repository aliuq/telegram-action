# Telegram Message Notification Action（中文说明）

这是一个用于发送 Telegram 通知的 GitHub Action，支持普通消息、按钮、附件、回复消息，以及本地校验与调试流程。

> 英文版 `README.md` 是主文档。若中英文有差异，请以英文版为准。

## 功能概览

- 发送 MarkdownV2 格式的文本消息
- 超长文本自动拆分为连续回复消息
- 在受支持私聊中通过项目内置的 Telegram draft 逻辑实现文本流式输出
- 发送单行或多行 inline buttons
- 支持从内联文本、本地文件、远程 URL 读取消息正文
- 发送本地文件、公共 URL 或 Telegram `file_id` 附件
- 支持通过 `attachments` 一次发送多个媒体文件
- 回复已有消息
- 通过 `TELEGRAM_TOPIC_ID` 发送到指定话题
- 显式开启或关闭链接预览
- 支持向已开启 discussion 的频道发送可评论的频道消息
- 本地校验场景配置
- 使用 `act` 做交互式集成验证

## 快速开始

### 前置准备

1. 通过 [@BotFather](https://t.me/BotFather) 创建机器人并获取 token。
2. 通过 [@userinfobot](https://t.me/userinfobot) 等方式获取目标 `chat_id`。
3. 在仓库 `Settings -> Secrets and variables -> Actions` 中配置：
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_TOPIC_ID`（发送到指定话题时使用）
   - `TELEGRAM_REPLY_TO_MESSAGE_ID`（回复某条已有消息时使用）

### 基本用法

```yaml
- name: Send Telegram Message
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: |
      🚀 A new commit was pushed!

      👤 Actor: ${{ github.actor }}
      📦 Repository: ${{ github.repository }}
      🌿 Ref: ${{ github.ref }}
```

### 从本地文件读取消息

```yaml
- name: Send changelog file
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_file: ".github/telegram/release-note.md"
```

### 从远程 URL 读取消息

```yaml
- name: Send release notes from URL
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message_url: "https://example.com/release-notes.md"
```

### 带按钮消息

`buttons` 支持两种 JSON 结构：

- 单行：`[{...}, {...}]`
- 多行：`[[{...}], [{...}]]`

每个按钮都必须包含 `text`，并且只能包含一个 Telegram 行为字段，例如 `url` 或 `callback_data`。

### 超长消息

当文本消息超过 Telegram 限制时，Action 会自动拆分并按顺序发送。后续每一段都会回复前一段消息，保证会话连续性。若设置了按钮，按钮只会附加在最后一段消息上。

### 流式响应

如果你希望 Telegram 中的文本像 AI 助手那样逐步出现，可以设置 `stream_response: "true"`。

现在的实现会优先遵循 Telegram 当前 Bot API 的能力边界：

- 在受支持的私聊里，Action 会通过内置的 `sendMessageDraft` 流程做渐进式输出，然后再发送最终落地消息
- 在群组、频道或其他不能使用 `sendMessageDraft` 的场景里，Action 会直接回退到普通 `sendMessage` 发送，不再模拟流式编辑

如果最终文本超过 Telegram 单条消息限制，本 Action 会把最终消息拆成多条回复链，保证阅读连续性。

```yaml
- name: Stream a Telegram response
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    stream_response: "true"
    message: |
      Build started...

      Resolving dependencies
      Compiling sources
      Uploading artifacts
```

适合流式响应的场景包括长任务进度、AI 输出、渐进式日志。普通短通知仍然建议直接使用常规 `message` 发送。当前 `stream_response` 仅支持纯文本，不能和 `attachment` 或 `attachments` 混用。typing 指示器的刷新频率最多每 5 秒一次，以符合 Telegram 对 chat action 生命周期 / 频率的文档约束。

### 带附件消息

```yaml
- name: Send a local photo
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: "🖼️ Photo attachment"
    attachment: "scripts/fixtures/sample-photo.webp"
    attachment_type: "photo"
```

当设置了 `attachment` 时，`message` 会作为附件说明（caption）发送。

如果是单个视频发送，并且你希望 Telegram 以可流式播放的视频消息展示它，可以设置 `supports_streaming: "true"`。

### 一次发送多个附件

当你需要一次发送多个媒体文件时，请使用 `attachments`。兼容的媒体会按 Telegram album 规则组合发送；不兼容的组合会自动拆成多个批次。

```yaml
- name: Send multiple media items
  uses: aliuq/telegram-action@master
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  with:
    message: "Build artifacts"
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

当使用 `attachments` 时，顶层 `message` 会先作为一条独立文本消息发送，这样既能安全拆分长文本，也能继续承载按钮。若需要媒体说明，请在 `attachments` 数组的单个条目中设置 `caption`。

边界行为如下：

- 1 个条目会退回普通单附件发送
- 2 到 10 个兼容条目会作为一个 Telegram media group 发送
- 超过 10 个条目会自动拆成多个批次，并保持原始顺序

### 频道评论区

Telegram 频道评论区不是单条消息级别的 Bot API 开关。如果 `TELEGRAM_CHAT_ID` 指向一个已经绑定 discussion group 的频道，那么消息发到该频道后，Telegram 会自动显示评论入口。这个 Action 负责发送消息，但“开启评论区”本身需要在 Telegram 频道设置里完成。

## 输入参数

完整参数说明请以英文版 `README.md` 为准。常用字段如下：

- `TELEGRAM_BOT_TOKEN`：Telegram Bot Token，通过 `env` 传入，必填
- `TELEGRAM_CHAT_ID`：聊天 / 群组 / 频道 ID，通过 `env` 传入，必填
- `TELEGRAM_TOPIC_ID`：目标话题 ID（`message_thread_id`），通过 `env` 传入，可选
- `TELEGRAM_REPLY_TO_MESSAGE_ID`：回复目标消息 ID，通过 `env` 传入，可选
- `message`：消息内容，可选
- `message_file`：仓库内 UTF-8 文本文件路径，可选
- `message_url`：远程 HTTP(S) URL，可选
- `stream_response`：是否启用文本流式响应。私聊通过 Action 内置的 `sendMessageDraft` 流程发送，超长输出会自动落成多条回复链消息；其他聊天自动回退到普通 `sendMessage`，取值 `"true"` 或 `"false"`。该选项当前只支持纯文本消息，不能与 `attachment` 或 `attachments` 同时使用
- `buttons`：按钮 JSON，可选
- `disable_link_preview`：`"true"` 或 `"false"`
- `attachment`：附件路径 / URL / Telegram `file_id`
- `attachments`：多附件 JSON 数组；每项支持 `type`、`source`，可选 `filename`、`caption`
- `attachment_type`：`photo`、`video`、`audio`、`animation`、`document`
- `attachment_filename`：本地文件上传时可选文件名覆盖
- `supports_streaming`：单个 `video` 附件是否启用 Telegram 流媒体模式，取值 `"true"` 或 `"false"`

`message`、`message_file`、`message_url` 三者只能设置一个；同时你仍然需要至少提供一个消息来源或 `attachment`。
`attachment` 与 `attachments` 不能同时使用；使用 `attachments` 时不要再设置 `attachment_type` 或 `attachment_filename`。
`stream_response` 当前只支持纯文本消息，不能与 `attachment` 或 `attachments` 同时使用。
Telegram 真正的 draft streaming 目前只适用于私聊，因此非私聊场景会自动使用普通非流式发送。
对于 `attachments`，若视频条目需要流媒体模式，请在 JSON 条目里设置 `supports_streaming: true`。

## 输出参数

- `message_id`：最后一条已发送 Telegram 消息的 ID
- `status`：执行状态，当前固定为 `"success"`

## 本地开发与验证

建议本地按这个顺序使用：

1. 先执行 `bun run test`，直接发送并测试所选场景。
   也可以执行 `bun run test -- <scenarioId>`，或执行 `bun run test -- --all`。
2. 如果你想快速跑本地单元测试，执行 `bun run test:unit`（基于 `vitest`）。
3. 如果你只想做解析层校验、不发消息，执行 `bun run test:validate`。
4. 需要通过 `act` 跑工作流级测试时，执行 `bun run test:act`，它会调用 `.github/workflows/test.yaml`。
5. 只有在你需要完全手动控制工作流时，再直接使用原始 `act` 命令。

### 1. 直接发送测试

先在仓库根目录创建 `.env`：

```bash
cat <<'EOF' > .env
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=yyy
TELEGRAM_TOPIC_ID=456
TELEGRAM_REPLY_TO_MESSAGE_ID=123
EOF
```

然后执行：

```bash
bun run test
bun run test -- buttons-flat
bun run test -- --all
```

对于 `bun run`，Bun 会自动加载仓库根目录的 `.env`，因此这里既不需要脚本内部手动解析 `.env`，也不需要显式传 `--env-file`。默认情况下，`bun run test` 会先让你按场景 id 或描述做一次过滤，再打开交互式多选界面，并将所选场景直接发送到 Telegram。对于 `expect_failure` 场景，只有按预期失败才算通过。

### 2. 统一测试入口

本地只保留一个交互式测试脚本，内部支持三种模式：

- `source`：直接运行源码环境
- `act`：通过 `act` 运行 GitHub Actions 环境
- `validate`：只做场景和输入校验，不真正发消息

创建根目录 `.env` 后运行：

```bash
bun run test
bun run test:unit
bun run test:act
bun run test:validate
```

测试脚本会把最近一次执行命令和日志保存在 `.test-history/` 里，并支持快速重跑上一次命令。共享 logger 会为每一行输出补上 ISO 8601 时间戳，方便在本地、Docker 和落盘日志里对齐问题。`act` 模式会保留彩色输出。GitHub Actions 中的 `notification` job 现在也会在单个 runner 里顺序执行所选场景，并通过 `scripts/workflow.ts` 直接驱动发送流程，而不是为每个场景单独起一个 job。

GitHub Actions 环境仍然保留可折叠的日志分组；普通 Node / Docker 运行时则会退回普通文本日志，不再直接输出原始 `::group::` / `::endgroup::` 控制行。在 CI 风格环境里，runner 还会把 `@clack/prompts` 的总结框降级成普通日志行，避免工作流日志和落盘日志出现难读的窄框/竖排输出。

## 常见问题

- **提示 `attachment path does not exist`**：请确认路径是仓库根目录下的相对路径，例如 `scripts/fixtures/sample-photo.webp`。
- **提示按钮 JSON 非法**：先把 `buttons` 单独拿出来做 JSON 校验，确保每个按钮都带 `text`。
- **回复或话题发送失败**：确认 `TELEGRAM_CHAT_ID`、`TELEGRAM_TOPIC_ID`、`TELEGRAM_REPLY_TO_MESSAGE_ID` 属于同一聊天/话题上下文，并且只设置你真正需要的变量。
- **格式显示异常**：先发送纯文本，再逐步加入 Markdown 内容排查转义问题。

## 文档建议

如果你要改功能、排查边界行为、查看完整参数或调试细节，请优先阅读英文版 [README.md](./README.md)。
