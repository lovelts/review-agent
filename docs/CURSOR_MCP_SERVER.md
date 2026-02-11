# 在 Cursor 中接入本项目的 MCP Server

本仓库提供 **MCP Stdio Server**，暴露 `read_file`、`list_directory`、`search_in_directory` 三个工具，让 Cursor 的 **Agent（Composer）** 在对话/代码审查时**由模型按需调用**（读仓库文件、列目录、搜索），实现「模型调 MCP」的用法。

## 1. 运行方式

MCP Server 是独立进程，通过 **stdio** 与 Cursor 通信。需要指定仓库根目录 `REPO_ROOT`（即工具内所有路径的相对根路径）。

```bash
# 在项目根目录执行，REPO_ROOT 指向当前仓库
REPO_ROOT=. npm run mcp:server

# 或指定绝对路径（多仓库时按需修改）
REPO_ROOT=/path/to/your/repo npx tsx src/mcp/server/stdio-server.ts
```

- 不设 `REPO_ROOT` 时，默认使用进程当前工作目录 `process.cwd()`。
- Cursor 会自行启动该进程，因此只需在 Cursor 的 MCP 配置里填写 **command**（及可选 **env**）。

## 2. 在 Cursor 里添加 MCP Server

### 方式 A：通过 Cursor 设置界面

1. 打开 **Cursor Settings** → **Features** → **MCP**
2. 点击 **Add New MCP Server**
3. 选择类型 **stdio**
4. **Name**：随意，例如 `cr-agent-repo`
5. **Command**：填写启动命令。若使用本项目根目录为仓库根，可写成（请把 `YOUR_CR_AGENT_PATH` 换成实际路径）：
   ```bash
   REPO_ROOT=YOUR_CR_AGENT_PATH npx tsx YOUR_CR_AGENT_PATH/src/mcp/server/stdio-server.ts
   ```
   或先 `cd` 到 crAgent 再跑（路径用绝对路径更稳妥）：
   ```bash
   cd /path/to/crAgent && REPO_ROOT=. npx tsx src/mcp/server/stdio-server.ts
   ```

### 方式 B：编辑配置文件

在**本项目**下使用（项目级配置）：

- 复制示例配置：
  ```bash
  mkdir -p .cursor
  cp docs/cursor-mcp.example.json .cursor/mcp.json
  ```
- 编辑 `.cursor/mcp.json`，把 `REPO_ROOT` 和路径改成你的环境（见下方示例）。

在**任意目录**使用（全局配置）：

- 编辑 `~/.cursor/mcp.json`，在 `mcpServers` 里加入同一段配置，并改好路径和 `REPO_ROOT`。

**配置示例**（`mcpServers` 片段）：

```json
{
  "mcpServers": {
    "cr-agent-repo": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/crAgent/src/mcp/server/stdio-server.ts"],
      "env": {
        "REPO_ROOT": "/absolute/path/to/your/code/repo"
      }
    }
  }
}
```

- `args` 里的路径建议写**绝对路径**，避免 Cursor 工作目录不同导致找不到文件。
- `env.REPO_ROOT`：工具内 `read_file` / `list_directory` / `search_in_directory` 的「仓库根」；审查哪个仓库就填哪个路径。

## 3. 暴露的工具

| 工具 | 说明 |
|------|------|
| `read_file` | 读取仓库内文件内容，参数：`path`（必填，相对 repo 根）、`encoding`（可选） |
| `list_directory` | 列出目录内容，参数：`path`（相对 repo 根，`.` 表示根目录） |
| `search_in_directory` | 在目录下搜索文本/正则，参数：`pattern`（必填）、`path`、`filePattern`（如 `*.ts`）、`maxMatches` |

路径均相对 `REPO_ROOT`，且会做安全解析，禁止 `..` 穿越到仓库外。

## 4. 使用说明

- MCP 工具仅在 **Cursor 的 Agent（Composer）** 中可用，普通 Chat 可能不显示。
- 在 Composer 里进行代码审查或问答时，模型会**自动选择**是否调用这些工具（读文件、列目录、搜索）。
- 若 Cursor 提示「需要批准工具调用」，请允许后即可看到工具结果并继续对话。

## 5. 与 CR Agent 后端的关系

- **CR Agent 后端**（Nest 服务）：通过 GitLab Webhook/CI 触发，用 Cursor CLI 或其它方式跑 CR，当前仍使用「提前拉取上下文」的 `enrichContext`，与 Cursor IDE 是否开 MCP 无关。
- **Cursor MCP Server**（本 stdio 进程）：只给 **Cursor IDE 内的 Agent** 用，让**模型在对话中按需调工具**。两者可同时存在：后端继续用现有 CR 流程，本地用 Cursor 时由模型调 MCP。

## 6. 故障排查

- **工具不出现**：确认 MCP 类型为 stdio、command/args 能在本机终端单独跑通；刷新 MCP 或重启 Cursor。
- **read_file / list_directory 报错**：检查 `REPO_ROOT` 是否指向正确目录、路径是否有读权限。
- **找不到 tsx**：在 crAgent 目录执行 `npm install`，用 `npx tsx` 即可；或全局安装 `npm i -g tsx` 后 command 改为 `tsx ...`。

## 相关文档

- [MCP 能力场景](./MCP_SCENARIOS.md)
- [MCP 动态上下文配置（CR 后端）](./MCP_SETUP.md)
