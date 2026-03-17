# Telegram Message Notification Action（中文说明）

这是一个用来从 GitHub Actions 发送 Telegram 消息的 Action。它支持文本、按钮、附件、回复、话题发送，以及维护这个仓库时要用到的本地测试流程。

> 英文版 `README.md` 是主文档。若中英文有差异，请以英文版为准。

## 功能概览

- 发送 MarkdownV2 文本消息
- 超长文本自动拆成回复链
- 在支持的私聊里用 `sendMessageDraft` 做流式文本输出
- 发送单行或多行 inline buttons
- 从内联文本、本地文件、远程 URL 读取消息正文
- 发送本地文件、公共 URL 或 Telegram `file_id` 附件
- 用 `attachments` 一次发送多个媒体文件
- 回复已有消息，或者通过环境变量发到指定话题
- 显式控制链接预览
- 先在本地校验场景，再跑真实发送
- 用 `act` 本地跑仓库里的工作流

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

现在的实现按 Telegram 目前的 Bot API 能力来走：

- 在支持的私聊里，Action 会先用 `sendMessageDraft` 做渐进式输出，再发送最终消息
- 在群组、频道或其他不能使用 `sendMessageDraft` 的场景里，会回退到普通 `sendMessage`

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

如果你要发进度、长输出，或者希望 Telegram 里能看到逐步生成的效果，用 `stream_response` 会比较合适。短一点、结果导向的通知，直接发普通 `message` 通常更省事。这个选项只支持纯文本，不能和 `attachment` 或 `attachments` 混用。typing 指示器最多每 5 秒刷新一次，和 Telegram 文档里的 chat action 约束保持一致。

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
- `message`：消息内容，可选。单附件场景里会尽量作为 caption 发送；如果用的是 `attachments`，它会先作为独立文本消息发出去
- `message_file`：仓库内 UTF-8 文本文件路径，可选
- `message_url`：远程 HTTP(S) URL，可选
- `stream_response`：是否启用文本流式响应。私聊通过 Action 内置的 `sendMessageDraft` 流程发送，超长输出会自动落成多条回复链消息；其他聊天自动回退到普通 `sendMessage`，取值 `"true"` 或 `"false"`。该选项当前只支持纯文本消息，不能与 `attachment` 或 `attachments` 同时使用
- `buttons`：按钮 JSON，可选
- `disable_link_preview`：`"true"` 或 `"false"`
- `attachment`：附件路径 / URL / Telegram `file_id`
- `attachments`：多附件 JSON 数组；每项支持 `type`、`source`，可选 `filename`、`caption`，视频还可以单独设置 `supports_streaming`
- `attachment_type`：`photo`、`video`、`audio`、`animation`、`document`
- `attachment_filename`：本地文件上传时可选文件名覆盖
- `supports_streaming`：单个 `video` 附件是否启用 Telegram 流媒体模式，取值 `"true"` 或 `"false"`

`message`、`message_file`、`message_url` 三者只能设置一个；同时你仍然需要至少提供一个消息来源、`attachment` 或 `attachments`。
`attachment` 与 `attachments` 不能同时使用；使用 `attachments` 时不要再设置 `attachment_type` 或 `attachment_filename`。
`stream_response` 当前只支持纯文本消息，不能与 `attachment` 或 `attachments` 同时使用。
Telegram 真正的 draft streaming 目前只适用于私聊，因此非私聊场景会自动使用普通非流式发送。
对于 `attachments`，若视频条目需要流媒体模式，请在 JSON 条目里设置 `supports_streaming: true`。

## 输出参数

- `message_id`：最后一条已发送 Telegram 消息的 ID
- `status`：执行状态，当前固定为 `"success"`

## 本地开发与验证

本地开发时，通常按这个顺序就够了：

1. 先执行 `bun run test` 打开本地 runner。
   如果你已经给了场景 id 或 `--all`，但没有显式写 `--mode`，runner 还是会先问你要在哪个环境里跑，只是不再重复弹出场景选择。
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

对于 `bun run`，Bun 会自动加载仓库根目录的 `.env`，所以这里不需要脚本自己再去解析 `.env`，也不用额外传 `--env-file`。直接执行 `bun run test` 会进入交互式 runner；如果你已经知道场景 id，`bun run test -- <scenarioId>` 会跳过场景选择，但仍然保留 mode 选择。对于 `expect_failure` 场景，只有按预期失败才算通过。

### 2. 统一测试入口

本地现在只保留一个 runner，里面有三种模式：

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

测试脚本会把最近一次执行命令和日志保存在 `.test-history/` 里，也支持快速重跑上一次命令。共享 logger 会给每一行补上 ISO 8601 时间戳，后面排查本地、Docker、落盘日志时会省事不少。`act` 模式会保留彩色输出。GitHub Actions 里的 `notification` job 现在也是单个 runner 顺序跑所选场景，由 `scripts/workflow.ts` 直接驱动发送流程。

如果你没有显式传 mode，runner 会先问你要在哪个环境里跑；要是命令行里已经带了场景 id 或 `--all`，它就直接复用这些选择，不再重复弹场景选择。GitHub Actions 里还是保留可折叠的日志分组；普通 Node / Docker 运行时会退回普通文本日志，不再直接输出原始 `::group::` / `::endgroup::` 控制行。在 CI 风格环境里，runner 也会把 `@clack/prompts` 的总结框降级成普通日志行，免得工作流日志和落盘日志里出现难读的窄框或竖排内容。

## 常见问题

- **提示 `attachment path does not exist`**：请确认路径是仓库根目录下的相对路径，例如 `scripts/fixtures/sample-photo.webp`。
- **提示按钮 JSON 非法**：先把 `buttons` 单独拿出来做 JSON 校验，确保每个按钮都带 `text`。
- **回复或话题发送失败**：确认 `TELEGRAM_CHAT_ID`、`TELEGRAM_TOPIC_ID`、`TELEGRAM_REPLY_TO_MESSAGE_ID` 属于同一聊天/话题上下文，并且只设置你真正需要的变量。
- **格式显示异常**：先发送纯文本，再逐步加入 Markdown 内容排查转义问题。

## 工作流文件

仓库里现在使用的测试工作流是 [.github/workflows/test.yaml](.github/workflows/test.yaml)。

## 文档建议

如果你要改功能、查边界行为、看完整参数或调试细节，还是建议优先读英文版 [README.md](./README.md)。
