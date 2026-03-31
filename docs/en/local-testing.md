# Local Testing

This repository ships with a scenario-driven runner instead of separate ad hoc scripts.

## Main commands

```bash
bun run test
bun run test:unit
bun run test:validate
bun run test:act
```

## What each mode does

- `bun run test` starts the interactive runner
- `bun run test:unit` runs the Vitest suite
- `bun run test:validate` validates scenarios and inputs without sending Telegram requests
- `bun run test:act` runs the workflow path through `.github/workflows/test.yaml`

## Runner modes

- `source`: execute the current workspace code directly
- `act`: execute the GitHub Actions workflow locally
- `validate`: validate scenario data only

## Local environment file

Create a repository-root `.env` file before source-mode or act-mode runs:

```bash
cat <<'EOF' > .env
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=yyy
TELEGRAM_TOPIC_ID=456
TELEGRAM_REPLY_TO_MESSAGE_ID=123
EOF
```

## Useful runner behavior

- the runner saves the rerun command before execution starts
- logs and rerun data are written to `.test-history/`
- the same scenario catalog powers source mode, validate mode, and act mode
- expected-failure scenarios pass only when they fail for the intended reason

## Common troubleshooting points

- bad attachment paths usually mean the file path is not relative to the repository root
- invalid buttons or attachments payloads usually fail during JSON parsing or shape validation
- reply and topic failures usually come from mixing IDs from different chats or threads
- remote media sends fail when Telegram cannot reach the public URL directly
