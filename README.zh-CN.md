# Telegram Message Notification Action（中文说明）

这是一个用于发送 Telegram 通知的 GitHub Action，支持普通消息、按钮、附件、回复消息，以及本地校验与调试流程。

> 英文版 `README.md` 是主文档。若中英文有差异，请以英文版为准。

## 功能概览

- 发送 MarkdownV2 格式的文本消息
- 发送单行或多行 inline buttons
- 发送本地文件、公共 URL 或 Telegram `file_id` 附件
- 回复群组话题或已有消息
- 显式开启或关闭链接预览
- 本地校验场景配置
- 使用 `act` 做交互式集成验证

## 快速开始

### 前置准备

1. 通过 [@BotFather](https://t.me/BotFather) 创建机器人并获取 token。
2. 通过 [@userinfobot](https://t.me/userinfobot) 等方式获取目标 `chat_id`。
3. 在仓库 `Settings -> Secrets and variables -> Actions` 中配置：
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `TELEGRAM_REPLY_TO_MESSAGE_ID`（回复话题消息用）

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

### 带按钮消息

`buttons` 支持两种 JSON 结构：

- 单行：`[{...}, {...}]`
- 多行：`[[{...}], [{...}]]`

每个按钮都必须包含 `text`，并且只能包含一个 Telegram 行为字段，例如 `url` 或 `callback_data`。

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

## 输入参数

完整参数说明请以英文版 `README.md` 为准。常用字段如下：

- `TELEGRAM_BOT_TOKEN`：Telegram Bot Token，通过 `env` 传入，必填
- `TELEGRAM_CHAT_ID`：聊天 / 群组 / 频道 ID，通过 `env` 传入，必填
- `TELEGRAM_REPLY_TO_MESSAGE_ID`：回复目标消息 ID，通过 `env` 传入，可选
- `message`：消息内容，可选
- `buttons`：按钮 JSON，可选
- `disable_link_preview`：`"true"` 或 `"false"`
- `attachment`：附件路径 / URL / Telegram `file_id`
- `attachment_type`：`photo`、`video`、`audio`、`animation`、`document`
- `attachment_filename`：本地文件上传时可选文件名覆盖

## 输出参数

- `message_id`：发送成功后的 Telegram 消息 ID
- `status`：执行状态，当前固定为 `"success"`

## 本地开发与验证

建议本地按这个顺序使用：

1. 先执行 `bun run test`，直接发送并测试所选场景。
   也可以执行 `bun run test -- <scenarioId>`，或执行 `bun run test -- --all`。
2. 如果你只想做解析层校验、不发消息，执行 `bun run test:validate`。
3. 需要通过 `act` 跑工作流级测试时，执行 `bun run test:act`，它会调用 `.github/workflows/test.yaml`。
4. 只有在你需要完全手动控制工作流时，再直接使用原始 `act` 命令。

### 1. 直接发送测试

先在仓库根目录创建 `.env`：

```bash
cat <<'EOF' > .env
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=yyy
TELEGRAM_REPLY_TO_MESSAGE_ID=123
EOF
```

然后执行：

```bash
bun run test
bun run test -- buttons-flat
bun run test -- --all
```

对于 `bun run`，Bun 会自动加载仓库根目录的 `.env`，因此这里既不需要脚本内部手动解析 `.env`，也不需要显式传 `--env-file`。默认情况下，`bun run test` 会打开交互式多选界面，并将所选场景直接发送到 Telegram。对于 `expect_failure` 场景，只有按预期失败才算通过。

### 2. 统一测试入口

本地只保留一个交互式测试脚本，内部支持三种模式：

- `source`：直接运行源码环境
- `act`：通过 `act` 运行 GitHub Actions 环境
- `validate`：只做场景和输入校验，不真正发消息

创建根目录 `.env` 后运行：

```bash
bun run test
bun run test:act
bun run test:validate
```

测试脚本会把最近一次执行命令和日志保存在 `.history/` 里，并支持快速重跑上一次命令。`act` 模式会保留彩色输出。

## 常见问题

- **提示 `attachment path does not exist`**：请确认路径是仓库根目录下的相对路径，例如 `scripts/fixtures/sample-photo.webp`。
- **提示按钮 JSON 非法**：先把 `buttons` 单独拿出来做 JSON 校验，确保每个按钮都带 `text`。
- **回复失败**：确认 `TELEGRAM_CHAT_ID` 和 `TELEGRAM_REPLY_TO_MESSAGE_ID` 属于同一话题上下文。
- **格式显示异常**：先发送纯文本，再逐步加入 Markdown 内容排查转义问题。

## 文档建议

如果你要改功能、排查边界行为、查看完整参数或调试细节，请优先阅读英文版 [README.md](./README.md)。
