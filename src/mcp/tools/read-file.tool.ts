import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { IMcpTool, McpToolResult, McpToolExecuteOptions } from '../interfaces/mcp-tool.interface';

/**
 * MCP Tool: 读取仓库内文件内容
 * 路径相对于 repoRoot，禁止路径穿越
 */
@Injectable()
export class ReadFileTool implements IMcpTool {
  readonly definition = {
    name: 'read_file',
    description: 'Read content of a file in the repository. Path is relative to repo root.',
    parameters: [
      {
        name: 'path',
        description: 'Relative path to the file from repo root',
        type: 'string' as const,
        required: true,
      },
      {
        name: 'encoding',
        description: 'Encoding (default: utf-8)',
        type: 'string' as const,
        required: false,
      },
    ],
  };

  async execute(
    args: Record<string, unknown>,
    options: McpToolExecuteOptions,
  ): Promise<McpToolResult> {
    const pathArg = args.path;
    if (typeof pathArg !== 'string' || !pathArg.trim()) {
      return { success: false, error: 'Missing or invalid argument: path (string)' };
    }

    const safePath = this.resolveSafePath(pathArg.trim(), options.repoRoot);
    if (!safePath) {
      return { success: false, error: 'Path escapes repo root or is invalid' };
    }

    try {
      const encoding = (args.encoding as BufferEncoding) || 'utf-8';
      const content = await readFile(safePath, encoding);
      return { success: true, data: { path: pathArg, content: String(content) } };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /** 解析路径并限制在 repoRoot 内，禁止 .. 穿越 */
  private resolveSafePath(relativePath: string, repoRoot: string): string | null {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const absolute = resolve(repoRoot, normalized);
    const repoReal = resolve(repoRoot);
    if (!absolute.startsWith(repoReal) || absolute === repoReal) {
      return null;
    }
    return absolute;
  }
}
