/**
 * MCP Tool 参数类型
 */
export type McpToolParamType = 'string' | 'number' | 'boolean' | 'array';

/**
 * MCP Tool 参数 JSON Schema（简化版，便于 AI/调用方理解）
 */
export interface McpToolParamSchema {
  name: string;
  description?: string;
  type: McpToolParamType;
  required?: boolean;
  default?: unknown;
}

/**
 * MCP Tool 元数据（用于注册与发现）
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  parameters: McpToolParamSchema[];
}

/**
 * MCP Tool 执行结果（统一结构，便于扩展）
 */
export interface McpToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * MCP Tool 接口
 * 所有 MCP 工具需实现此接口，便于后续扩展更多 tools（GitLab、analyzers 等）
 */
export interface IMcpTool {
  readonly definition: McpToolDefinition;

  /**
   * 执行工具
   * @param args 由 definition.parameters 定义的键值对
   * @param options 执行时上下文（如 repoRoot、projectId 等）
   */
  execute(
    args: Record<string, unknown>,
    options: McpToolExecuteOptions,
  ): Promise<McpToolResult>;
}

/**
 * 执行 MCP Tool 时的上下文选项
 */
export interface McpToolExecuteOptions {
  /** 仓库根目录（绝对路径），由 REPO_ROOT 等配置解析 */
  repoRoot: string;
  /** 当前 MR 的 projectId，可选，用于按项目解析 repo */
  projectId?: number;
  /** 当前审查文件路径（相对 repo 根），用于相对路径解析 */
  currentFilePath?: string;
}
