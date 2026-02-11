import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'fs/promises';
import { resolve } from 'path';
import { IMcpTool, McpToolResult, McpToolExecuteOptions } from '../interfaces/mcp-tool.interface';

const DEFAULT_MAX_FILES = 200;
const DEFAULT_MAX_MATCHES = 50;
const DEFAULT_MAX_LINE_LENGTH = 500;

/**
 * MCP Tool: 在仓库目录内搜索文本（支持正则）
 * 路径相对于 repoRoot；大仓库会限制扫描文件数和匹配数
 */
@Injectable()
export class SearchInDirectoryTool implements IMcpTool {
  readonly definition = {
    name: 'search_in_directory',
    description:
      'Search for a pattern in files under a directory. Returns matching lines with file path and line number.',
    parameters: [
      { name: 'pattern', description: 'Search pattern (string or regex)', type: 'string' as const, required: true },
      { name: 'path', description: 'Relative path to directory to search (default: ".")', type: 'string' as const, required: false },
      { name: 'filePattern', description: 'Glob-like filter, e.g. "*.ts" (optional)', type: 'string' as const, required: false },
      { name: 'maxMatches', description: 'Max number of matches to return (default: 50)', type: 'number' as const, required: false },
    ],
  };

  async execute(
    args: Record<string, unknown>,
    options: McpToolExecuteOptions,
  ): Promise<McpToolResult> {
    const patternArg = args.pattern;
    if (typeof patternArg !== 'string' || !patternArg.trim()) {
      return { success: false, error: 'Missing or invalid argument: pattern (string)' };
    }

    const relPath = typeof args.path === 'string' ? args.path.trim() || '.' : '.';
    const safeDir = this.resolveSafePath(relPath, options.repoRoot);
    if (!safeDir) {
      return { success: false, error: 'Path escapes repo root or is invalid' };
    }

    const maxMatches = typeof args.maxMatches === 'number' ? Math.min(100, args.maxMatches) : DEFAULT_MAX_MATCHES;
    const filePattern = typeof args.filePattern === 'string' ? args.filePattern.trim() : null;

    try {
      const matches = await this.searchRecursive(
        safeDir,
        options.repoRoot,
        patternArg,
        filePattern,
        maxMatches,
      );
      return { success: true, data: { pattern: patternArg, path: relPath, matches } };
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

  private async searchRecursive(
    dir: string,
    repoRoot: string,
    pattern: string,
    filePattern: string | null,
    maxMatches: number,
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    let filesScanned = 0;
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'g');
    } catch {
      regex = new RegExp(escapeRegex(pattern), 'gi');
    }

    const matchFile = filePattern ? this.globToRegex(filePattern) : () => true;

    const scan = async (currentDir: string): Promise<void> => {
      if (results.length >= maxMatches || filesScanned >= DEFAULT_MAX_FILES) return;

      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const e of entries) {
        if (results.length >= maxMatches || filesScanned >= DEFAULT_MAX_FILES) break;
        const full = resolve(currentDir, e.name);

        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build') continue;
          await scan(full);
          continue;
        }

        if (!e.isFile() || !matchFile(e.name)) continue;
        filesScanned++;

        try {
          const content = await readFile(full, 'utf-8');
          const relFile = full.slice(resolve(repoRoot).length).replace(/^[/\\]/, '') || e.name;
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
            if (regex.test(lines[i])) {
              results.push({
                file: relFile,
                line: i + 1,
                content: lines[i].slice(0, DEFAULT_MAX_LINE_LENGTH).trim(),
              });
            }
          }
        } catch {
          // skip binary or unreadable
        }
      }
    };

    await scan(dir);
    return results;
  }

  private globToRegex(glob: string): (name: string) => boolean {
    const re = glob
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${re}$`, 'i');
    return (name: string) => regex.test(name);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
