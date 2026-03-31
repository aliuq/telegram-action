# Git Commit Instructions

本文件定义本仓库的 Commit Message 生成规则。

目标不是追求花样，而是追求稳定输出，让每次提交都能清晰、规范地表达改动内容和动机。

## Core Rules

所有提交都必须满足以下要求：

1. 只输出一条完整的 Commit Message
2. Header 使用 Conventional Commits 格式：`<type>(<scope>): <subject>`
3. Body 必填，且必须双语：先 `EN:`，后 `ZH:`
4. Body 必须使用单层短列表
5. Body 重点解释为什么改，不按文件名罗列变更
6. 如果一次提交包含多个独立变更点，仍然只允许一条提交信息，但中英两部分都必须覆盖全部变更点

## Stable Output Contract

最终输出必须是纯文本，严格使用以下结构：

```text
<type>(<scope>): <subject>

EN:
- <point 1>
- <point 2>

ZH:
- <要点 1>
- <要点 2>

[BREAKING CHANGE: <description>]
[Closes #<issue-number>]
```

这个结构是强制的。

- 必须保留 `EN:` 和 `ZH:` 两个标签
- `EN:` 下方只允许单层 `-` 列表
- `ZH:` 下方只允许单层 `-` 列表
- 不要缩进
- 不要子列表
- 不要续行
- 每个要点单独一行
- 英文和中文之间保留一个空行
- Footer 只有在确实需要时才添加
- 不要使用 Markdown 代码块包裹最终输出

## Header Rules

### Type

只能从以下类型中选择：

| Type | Use for |
| :--- | :--- |
| `feat` | 新功能或新能力 |
| `fix` | Bug 修复或行为纠正 |
| `docs` | 文档、说明、示例文本更新 |
| `refactor` | 重构，不改变对外行为 |
| `perf` | 性能优化 |
| `test` | 测试、fixture、scenario 更新 |
| `build` | 构建、依赖、打包配置 |
| `ci` | GitHub Actions 或 CI 流程 |
| `chore` | 维护性杂项，不属于以上分类 |
| `revert` | 回滚已有提交 |

选择原则：

- 优先选择最能代表用户可感知结果的类型
- 多变更点提交时，选择最能概括整体主题的类型
- 不要因为修改了配置文件就默认使用 `chore`

### Scope

`scope` 应尽量填写，除非这次改动横跨多个模块且无法合理归类。

推荐 scope：

| Scope | Typical areas |
| :--- | :--- |
| `feat` | 新增功能 (Feature) |
| `fix` | 修复 Bug |
| `docs` | 文档变更 |
| `style` | 代码格式 (不影响逻辑) |
| `refactor` | 代码重构 (无新功能/Bug修复) |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `build` | 构建系统/依赖 |
| `ci` | CI 配置 |
| `chore` | 杂项/工具变动 |
| `revert` | 回滚提交 |

### Subject

`subject` 必须满足以下要求：

- 使用英文祈使句
- 以动词原形开头，如 `add`、`fix`、`update`、`simplify`
- 首字母小写，专有名词除外
- 不以句号结尾
- 不使用过去式或进行时
- 尽量控制在 50 个字符以内，Header 总长度不超过 72 个字符

推荐写法：

- `feat(base): add retry support for send failures`
- `fix(base-alpine): preserve escaped markdown characters`

避免写法：

- `fix(messages): fixed markdown parsing`
- `docs: updating readme.`

## Body Rules

为了稳定输出，Body 不再追求自由发挥，直接遵循下面的刚性规则：

1. `EN:` 固定在前，`ZH:` 固定在后
2. 每个语言部分写 2 到 4 个要点
3. 每个要点只写一行
4. 每行只表达一个主题
5. 不要缩进，不要子列表，不要解释性续行
6. 先写英文，再写对应中文，结构尽量对齐

内容要求：

- 说明修改动机、限制、收益、行为变化
- 不要只写文件名或函数名
- 不要把正文写成流水账
- 多变更点时，中英文两部分都必须完整覆盖

如果模型不稳定，优先减少句子长度，不要增加花样格式。

## Decision Process

生成提交信息时，按下面顺序执行：

1. 先检查全部暂存文件，不得跳过任何一个
2. 判断这些改动是否属于同一主题
3. 选择最合适的 `type`
4. 根据主要影响模块选择 `scope`
5. 用一句英文祈使句写 `subject`
6. 写 `EN:` 下的 2 到 4 个短要点
7. 写 `ZH:` 下与英文结构对齐的 2 到 4 个短要点
8. 如果存在 Breaking Change 或 Issue 关联，再补 Footer
9. 最后检查是否只输出了一条提交信息，且所有变更点都已覆盖

## Quick Checklist

输出前必须确认：

- 只有一条 Commit Message
- Header 格式正确
- `type` 合法
- `scope` 合理，无法归类时才省略
- `subject` 是英文祈使句
- Body 包含 `EN:` 和 `ZH:` 两个固定标签
- Body 是单层短列表
- 没有缩进、子列表、续行
- Body 解释的是为什么
- 多变更点没有遗漏
- 最终输出是纯文本，不带代码块

## Examples

### Stable feature example

```text
feat(action): expand message sources and media delivery

EN:
- Let workflows load message content from inline text, repository files, or remote URLs
- Add long-message chunking so large updates can be delivered within Telegram limits
- Add batched attachment delivery so media collections can be sent more reliably

ZH:
- 支持工作流从内联文本、仓库文件或远程 URL 读取消息内容
- 增加长消息拆分能力，让大段更新内容也能在 Telegram 限制内稳定送达
- 增加批量附件发送能力，让媒体集合的投递更可靠
```

### Stable refactor example

```text
refactor(repo): simplify resize behavior and page structure

EN:
- Replace scattered manual resize logic with one shared layout model
- Split large page responsibilities so layout code and editor code are easier to maintain
- Remove obsolete resize state so future UI changes have less coupling

ZH:
- 用统一布局模型替换分散的手写尺寸调整逻辑
- 拆分过大的页面职责，让布局代码和编辑器代码更容易维护
- 移除过时的尺寸状态，降低后续界面调整的耦合度
```

### Stable docs example

```text
docs(repo): clarify action inputs and update examples

EN:
- Clarify input rules so users can understand valid message and attachment combinations
- Refresh examples so local validation and workflow usage stay aligned

ZH:
- 澄清输入规则，帮助用户理解哪些消息和附件组合是合法的
- 更新示例内容，使本地校验和工作流用法保持一致
```
