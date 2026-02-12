# MCP 配置说明

本项目的 MCP 能力**仅通过 Stdio Server 在 Cursor IDE 内**使用，供 Agent（Composer）在对话/代码审查时**由模型按需调用** `read_file`、`list_directory`、`search_in_directory` 三个工具。

- **CR Agent 后端**（Nest 服务）：通过 GitLab Webhook/CI 触发时，**不再**做「动态拉取仓库上下文」；CR 输入仅包含 diff、周围代码与 Analyzers 结果。若需在 Cursor 内审查时让模型读仓库文件，请配置 MCP Stdio Server。
- **配置与运行方式**：见 [在 Cursor 中接入 MCP Server](./CURSOR_MCP_SERVER.md)。

## 相关文档

- [在 Cursor 中接入 MCP Server](./CURSOR_MCP_SERVER.md) — stdio server 配置与工具说明
- [架构说明](./ARCHITECTURE.md)
