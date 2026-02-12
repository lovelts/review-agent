/**
 * MCP Stdio Server for Cursor
 *
 * 暴露 read_file / list_directory / search_in_directory 三个工具，
 * 供 Cursor 的 Agent（Composer）在代码审查时按需调用。
 *
 * 使用 .mts 入口，以 ESM 运行，使 SDK 解析走 import 条件（dist/esm）。
 *
 * 运行方式（需先设置 REPO_ROOT）：
 *   REPO_ROOT=/path/to/repo npx tsx src/mcp/server/stdio-server.mts
 * 或在 Cursor 的 MCP 配置里填写上述 command。
 */

import { readFile, readdir } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';

const REPO_ROOT = process.env.REPO_ROOT
  ? resolve(process.cwd(), process.env.REPO_ROOT)
  : process.cwd();

function resolveSafe(relativePath: string, repoRoot: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '') || '.';
  const absolute = resolve(repoRoot, normalized);
  const repoReal = resolve(repoRoot);
  if (!absolute.startsWith(repoReal)) return null;
  return absolute;
}

async function doReadFile(
  pathArg: string,
  encoding: string,
): Promise<{ path: string; content: string } | string> {
  const safe = resolveSafe(pathArg.trim(), REPO_ROOT);
  if (!safe) return 'Path escapes repo root or is invalid';
  const content = await readFile(safe, encoding as BufferEncoding);
  return { path: pathArg, content: String(content) };
}

async function doListDir(
  pathArg: string,
): Promise<{ path: string; entries: Array<{ name: string; type: string }> } | string> {
  const safe = resolveSafe(pathArg.trim() || '.', REPO_ROOT);
  if (!safe) return 'Path escapes repo root or is invalid';
  const entries = await readdir(safe, { withFileTypes: true });
  return {
    path: pathArg || '.',
    entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })),
  };
}

const DEFAULT_MAX_FILES = 200;
const DEFAULT_MAX_MATCHES = 50;
const MAX_LINE = 500;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(glob: string): (name: string) => boolean {
  const re = glob.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
  const regex = new RegExp(`^${re}$`, 'i');
  return (name: string) => regex.test(name);
}

async function doSearch(
  dirPath: string,
  pattern: string,
  filePattern: string | null,
  maxMatches: number,
): Promise<
  | {
      pattern: string;
      path: string;
      matches: Array<{ file: string; line: number; content: string }>;
    }
  | string
> {
  const safeDir = resolveSafe(dirPath.trim() || '.', REPO_ROOT);
  if (!safeDir) return 'Path escapes repo root or is invalid';
  const results: Array<{ file: string; line: number; content: string }> = [];
  let filesScanned = 0;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'g');
  } catch {
    regex = new RegExp(escapeRegex(pattern), 'gi');
  }
  const matchFile = filePattern ? globToRegex(filePattern) : () => true;
  const repoReal = resolve(REPO_ROOT);

  async function scan(currentDir: string): Promise<void> {
    if (results.length >= maxMatches || filesScanned >= DEFAULT_MAX_FILES) return;
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const e of entries) {
      if (results.length >= maxMatches || filesScanned >= DEFAULT_MAX_FILES) break;
      const full = resolve(currentDir, e.name);
      if (e.isDirectory()) {
        if (
          e.name === 'node_modules' ||
          e.name === '.git' ||
          e.name === 'dist' ||
          e.name === 'build'
        )
          continue;
        await scan(full);
        continue;
      }
      if (!e.isFile() || !matchFile(e.name)) continue;
      filesScanned++;
      try {
        const content = await readFile(full, 'utf-8');
        const relFile = full.slice(repoReal.length).replace(/^[/\\]/, '') || e.name;
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
          if (regex.test(lines[i])) {
            results.push({
              file: relFile,
              line: i + 1,
              content: lines[i].slice(0, MAX_LINE).trim(),
            });
          }
        }
      } catch {
        /* skip */
      }
    }
  }
  await scan(safeDir);
  return { pattern, path: dirPath || '.', matches: results };
}

async function main() {
  const server = new McpServer({
    name: 'cr-agent-repo-tools',
    version: '1.0.0',
  });

  server.registerTool(
    'read_file',
    {
      title: 'Read File',
      description: 'Read content of a file in the repository. Path is relative to repo root.',
      inputSchema: z.object({
        path: z.string().describe('Relative path to the file from repo root'),
        encoding: z.string().optional().describe('Encoding (default: utf-8)'),
      }),
    },
    async (args) => {
      const out = await doReadFile(args.path, args.encoding ?? 'utf-8');
      const text = typeof out === 'string' ? `Error: ${out}` : JSON.stringify(out, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.registerTool(
    'list_directory',
    {
      title: 'List Directory',
      description:
        'List entries (files and subdirectories) in a directory. Path is relative to repo root.',
      inputSchema: z.object({
        path: z.string().describe('Relative path to the directory (use "." for repo root)'),
      }),
    },
    async (args) => {
      const out = await doListDir(args.path || '.');
      const text = typeof out === 'string' ? `Error: ${out}` : JSON.stringify(out, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.registerTool(
    'search_in_directory',
    {
      title: 'Search in Directory',
      description:
        'Search for a pattern in files under a directory. Returns matching lines with file path and line number.',
      inputSchema: z.object({
        pattern: z.string().describe('Search pattern (string or regex)'),
        path: z.string().optional().describe('Relative path to directory (default: ".")'),
        filePattern: z.string().optional().describe('Glob-like filter, e.g. "*.ts"'),
        maxMatches: z.number().optional().describe('Max matches to return (default: 50)'),
      }),
    },
    async (args) => {
      const out = await doSearch(
        args.path ?? '.',
        args.pattern,
        args.filePattern ?? null,
        Math.min(100, args.maxMatches ?? DEFAULT_MAX_MATCHES),
      );
      const text = typeof out === 'string' ? `Error: ${out}` : JSON.stringify(out, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
