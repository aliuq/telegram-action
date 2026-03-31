# 边界规则

这页专门放示例里不容易看出来的组合规则

## 消息来源

- `message`、`message_file`、`message_url` 只能设置一个
- 消息来源、`attachment`、`attachments` 至少要有一项
- `message_url` 必须以 `http://` 或 `https://` 开头

## 附件规则

- `attachment` 和 `attachments` 不能同时使用
- 设置 `attachment` 时必须带 `attachment_type`
- `attachments` 不能再搭配 `attachment_type` 或 `attachment_filename`
- 顶层 `supports_streaming` 只能配合单个 `attachment`，而且 `attachment_type` 必须是 `video`
- `attachments` 里的 `supports_streaming` 要写成视频条目里的 JSON 布尔值

## caption 规则

- 单附件场景里，`message` 只有在格式化后仍然放得进 caption 限制时，才会直接变成 caption
- 放不下时，Action 会先发文本分片，再发附件
- 多附件场景里，顶层 `message` 不会变成批量 caption，而是永远先作为文本消息发出去

## 按钮和长消息

- 按钮不能单独发送
- 按钮只挂在最后一个文本分片上
- 单附件如果走 caption 路径，且 caption 存在，按钮会跟着附件消息一起发出

## 多附件批次

- `attachments` 里只有 1 个条目时，会退回单附件路径
- media group 只接受兼容类型
- `animation` 永远单独发送
- 每个条目的 caption 会在请求发出前先校验长度

## 本地文件规则

- 仓库路径是相对工作区根目录解析的
- 出现 `attachment path does not exist`，通常代表这个值被当成本地路径处理，但实际找不到文件
- `attachment_filename` 和批量条目里的 `filename` 都只适用于本地上传
