# 本地测试

这个仓库已经内置了一套场景驱动的 runner，不需要额外再拼零散脚本

## 常用命令

```bash
bun run test
bun run test:unit
bun run test:validate
bun run test:act
```

## 每个命令负责什么

- `bun run test` 打开交互式 runner
- `bun run test:unit` 跑 Vitest
- `bun run test:validate` 只校验场景和输入，不发 Telegram 请求
- `bun run test:act` 通过 `.github/workflows/test.yaml` 跑工作流路径

## runner 模式

- `source`：直接运行当前工作区代码
- `act`：在本地跑 GitHub Actions 工作流
- `validate`：只校验场景数据

## 本地环境文件

source 模式和 act 模式前，先在仓库根目录放一个 `.env`：

```bash
cat <<'EOF' > .env
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=yyy
TELEGRAM_TOPIC_ID=456
TELEGRAM_REPLY_TO_MESSAGE_ID=123
EOF
```

## runner 的几个行为

- 开始执行前就会先保存重跑命令
- 日志和重跑信息会写进 `.test-history/`
- source、validate、act 三种模式共用同一套场景目录
- 预期失败场景只有在按预期失败时才算通过

## 常见排查点

- 附件路径错误，通常是因为路径不是相对仓库根目录
- 按钮或附件 JSON 非法，通常会在解析或结构校验阶段直接报错
- 回复或话题发送失败，通常是因为混用了不同聊天或不同线程的 ID
- 远程媒体发送失败，通常是因为 Telegram 无法直接访问这个公开 URL
