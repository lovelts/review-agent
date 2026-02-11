import { Injectable } from '@nestjs/common';
import { readdir } from 'fs/promises';
import { resolve } from 'path';
import { IMcpTool, McpToolResult, McpToolExecuteOptions } from '../interfaces/mcp-tool.interface';

/**
 * MCP Tool: 列出仓库内目录下的条目（文件/子目录）
 * 路径相对于 repoRoot，禁止路径穿越
 */
@Injectable()
export class ListDirectoryTool implements IMcpTool {
  readonly definition = {
    name: 'list_directory',
    description: 'List entries (files and subdirectories) in a directory. Path is relative to repo root.',
    parameters: [
      { name: 'path', description: 'Relative path to the directory (use "." for repo root)', type: 'string' as const, required: true },
    ],
  };

  async execute(
    args: Record<string, unknown>,
    options: McpToolExecuteOptions,
  ): Promise<McpToolResult> {
    const pathArg = args.path;
    const relPath = typeof pathArg === 'string' ? pathArg.trim() || '.' : '.';

    const safePath = this.resolveSafePath(relPath, options.repoRoot);
    if (!safePath) {
      return { success: false, error: 'Path escapes repo root or is invalid' };
    }

    try {
      const entries = await readdir(safePath, { withFileTypes: true });
      const list = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
      }));
      return { success: true, data: { path: relPath, entries: list } };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  private resolveSafePath(relativePath: string, repoRoot: string): string | null {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '') || '.';
    const absolute = resolve(repoRoot, normalized);
    const repoReal = resolve(repoRoot);
    if (!absolute.startsWith(repoReal)) {
      return null;
    }
    return absolute;
  }
}
