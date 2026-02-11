# MCP 动态上下文配置说明

MCP 模块用于在代码审查时**动态拉取仓库内上下文**（读文件、列目录、搜索），使 AI 能结合「同目录文件、import 引用文件」等做更准确的 CR。架构可扩展，后续可接入更多 MCP 工具（如 GitLab API、analyzers 等）。

## 前置条件

- 服务能访问**仓库在磁盘上的路径**（例如与 GitLab 同机部署、或 CI 中 clone 到固定目录）。
- 配置 `REPO_ROOT` 或按项目配置 `REPO_ROOT_<projectId>`。

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `REPO_ROOT` | 单仓库时的仓库根目录（相对或绝对路径） | `./repos/my-project` 或 `/data/git/repos/my-project` |
| `REPO_ROOT_<projectId>` | 多仓库时，指定项目的仓库根目录 | `REPO_ROOT_123=/data/git/project-123` |
| `USE_MCP` | 是否启用 MCP 动态上下文（默认 `true`） | `true` / `false` |

- 未配置 `REPO_ROOT` 时，MCP 不会拉取动态上下文，CR 仍仅使用 diff + 周围代码。
- 路径会与 `process.cwd()` 做 `path.resolve`，相对路径即相对于进程工作目录。

## 当前提供的 MCP 工具

| 工具名 | 说明 |
|--------|------|
| `read_file` | 读取仓库内文件内容，路径相对 repo 根，禁止路径穿越 |
| `list_directory` | 列出目录下文件和子目录 |
| `search_in_directory` | 在目录下搜索文本/正则，返回匹配行及文件、行号 |

这些工具会在 **enrichContext** 阶段被自动使用：

1. **同目录列表**：对当前审查文件所在目录执行 `list_directory`，把结果写入「Dynamic Context」。
2. **import 相关文件**：从 diff 中解析 `from './...'` / `require('./...')` 等相对路径，对最多 3 个源码文件执行 `read_file`，将内容片段写入上下文。

后续可在此处增加「按符号搜索」「读测试文件」等策略，或由 AI 通过 Function Calling 按需调用上述工具。

## 扩展新 MCP 工具

1. 在 `src/mcp/tools/` 下新增实现类，实现 `IMcpTool` 接口（`definition` + `execute(args, options)`）。
2. 在 `McpToolsModule` 的 `providers` 中注册该工具。
3. 在 `McpToolsService.onModuleInit` 中调用 `this.registerTool(yourTool)`。

接口定义见 `src/mcp/interfaces/mcp-tool.interface.ts`。`options` 中包含 `repoRoot`、`projectId`、`currentFilePath`，便于做路径解析与权限控制。

## 与 CR Pipeline 的衔接

- 在 **AgentService.executeCR** 中，若 `USE_MCP !== 'false'` 且注入了 `McpToolsService`，会在生成 Cursor 输入前调用 `mcpToolsService.enrichContext(context)`。
- 返回的 Markdown 会插入到 CR 输入文件的「Dynamic Context (from repository)」小节，供 Cursor 使用。
- 未配置 `REPO_ROOT` 时 `enrichContext` 直接返回空字符串，不报错。

## Cursor 里由模型调 MCP（stdio server）

若希望**在 Cursor IDE 内**由 Agent（Composer）**按需调用**上述工具（模型决定何时读文件、列目录、搜索），需单独运行 **MCP Stdio Server**，并在 Cursor 中配置 MCP。

- 运行：`REPO_ROOT=/path/to/repo npm run mcp:server`
- 配置方式与示例见：[在 Cursor 中接入 MCP Server](./CURSOR_MCP_SERVER.md)

与 CR Agent 后端的「enrichContext 自动拉取」是两套用法：后端仍用现有流程；Cursor 本地对话时用 stdio server 让模型调工具。

## 相关文档

- [MCP 能力场景](./MCP_SCENARIOS.md) — 场景与优先级
- [在 Cursor 中接入 MCP Server](./CURSOR_MCP_SERVER.md) — Cursor stdio 配置
- [架构说明](./ARCHITECTURE.md)
