import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { CRContext } from '../common/types';
import { IMcpTool, McpToolExecuteOptions, McpToolResult } from './interfaces/mcp-tool.interface';
import { ReadFileTool } from './tools/read-file.tool';
import { ListDirectoryTool } from './tools/list-directory.tool';
import { SearchInDirectoryTool } from './tools/search-in-directory.tool';

/**
 * MCP Tools 服务
 * - 注册与执行 MCP 工具（可扩展：后续可加入 GitLab、analyzers 等）
 * - 根据 CR 上下文自动拉取仓库内相关文件/目录/搜索结果，拼成「动态上下文」供 AI 使用
 */
@Injectable()
export class McpToolsService implements OnModuleInit {
  private readonly logger = new Logger(McpToolsService.name);
  private readonly tools = new Map<string, IMcpTool>();

  constructor(
    private readonly configService: ConfigService,
    private readonly readFileTool: ReadFileTool,
    private readonly listDirectoryTool: ListDirectoryTool,
    private readonly searchInDirectoryTool: SearchInDirectoryTool,
  ) {}

  onModuleInit() {
    this.registerTool(this.readFileTool);
    this.registerTool(this.listDirectoryTool);
    this.registerTool(this.searchInDirectoryTool);
    this.logger.log(
      `Registered ${this.tools.size} MCP tools: ${Array.from(this.tools.keys()).join(', ')}`,
    );
  }

  /**
   * 注册 MCP 工具（扩展点：后续新 tool 在此注册）
   */
  registerTool(tool: IMcpTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  /**
   * 获取所有已注册工具的元数据
   */
  getToolDefinitions(): Array<{ name: string; description: string; parameters: unknown[] }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
      parameters: t.definition.parameters,
    }));
  }

  /**
   * 按名称执行工具
   */
  async executeTool(
    name: string,
    args: Record<string, unknown>,
    options: McpToolExecuteOptions,
  ): Promise<McpToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    return tool.execute(args, options);
  }

  /**
   * 解析当前 MR 对应的仓库根路径
   * 支持 REPO_ROOT（单仓库）或 REPO_ROOT_<projectId>（多仓库）
   */
  resolveRepoRoot(projectId?: number): string | null {
    if (projectId != null) {
      const perProject = this.configService.get<string>(`REPO_ROOT_${projectId}`);
      if (perProject?.trim()) {
        return resolve(process.cwd(), perProject.trim());
      }
    }
    const root = this.configService.get<string>('REPO_ROOT');
    if (!root?.trim()) return null;
    return resolve(process.cwd(), root.trim());
  }

  /**
   * 根据 CR 上下文自动拉取仓库内相关上下文，返回可拼入 prompt 的 Markdown
   * - 列出当前文件所在目录
   * - 从 diff 中提取 import/require 路径并读取相关文件（最多 3 个）
   * - 可选：按符号简单搜索（限制条数）
   */
  async enrichContext(context: CRContext): Promise<string> {
    const repoRoot = this.resolveRepoRoot(context.mrInfo?.projectId);
    if (!repoRoot) {
      this.logger.debug('REPO_ROOT not set, skip MCP context enrichment');
      return '';
    }

    const options: McpToolExecuteOptions = {
      repoRoot,
      projectId: context.mrInfo?.projectId,
      currentFilePath: context.filePath,
    };

    const sections: string[] = [];

    try {
      // 1. 当前文件所在目录列表
      const dirPath = context.filePath.includes('/')
        ? context.filePath.replace(/\/[^/]+$/, '')
        : context.filePath.includes('\\')
          ? context.filePath.replace(/\\[^\\]+$/, '')
          : '.';
      const listRes = await this.listDirectoryTool.execute({ path: dirPath || '.' }, options);
      if (
        listRes.success &&
        listRes.data &&
        typeof listRes.data === 'object' &&
        'entries' in listRes.data
      ) {
        const entries = (listRes.data as { entries: Array<{ name: string; type: string }> })
          .entries;
        const list = entries.map((e) => `${e.name} (${e.type})`).join(', ');
        sections.push(`### Files in same directory (${dirPath || '.'})\n${list || '(empty)'}`);
      }

      // 2. 从 diff 中提取相对路径的 import/require，读取最多 3 个文件
      const importPaths = this.extractImportPaths(context.diff, dirPath);
      const readLimit = 3;
      for (let i = 0; i < Math.min(importPaths.length, readLimit); i++) {
        const relPath = importPaths[i];
        const readRes = await this.readFileTool.execute({ path: relPath }, options);
        if (
          readRes.success &&
          readRes.data &&
          typeof readRes.data === 'object' &&
          'content' in readRes.data
        ) {
          const content = (readRes.data as { path: string; content: string }).content;
          const preview = content.split('\n').slice(0, 80).join('\n');
          sections.push(
            `### Related file: \`${relPath}\`\n\`\`\`\n${preview}${content.split('\n').length > 80 ? '\n...' : ''}\n\`\`\``,
          );
        }
      }

      if (sections.length === 0) return '';

      return `## Dynamic Context (from repository)\n\n${sections.join('\n\n')}\n\n---\n`;
    } catch (error) {
      this.logger.warn('MCP enrichContext failed', error);
      return '';
    }
  }

  /**
   * 从 diff 文本中提取可能的相对路径（import/require）
   */
  private extractImportPaths(diff: string, baseDir: string): string[] {
    const paths: string[] = [];
    const seen = new Set<string>();

    // from './xxx' from "../xxx" require('./xxx') require("../xxx")
    const patterns = [
      /from\s+['"](\.\.?\/[^'"]+)['"]/g,
      /require\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
      /import\s*\(['"](\.\.?\/[^'"]+)['"]\)/g,
    ];

    for (const re of patterns) {
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(diff)) !== null) {
        let p = m[1].replace(/\\/g, '/');
        if (
          !p.endsWith('.ts') &&
          !p.endsWith('.tsx') &&
          !p.endsWith('.js') &&
          !p.endsWith('.jsx')
        ) {
          continue; // 只取明确是源码的路径，避免读 .json/.css 等
        }
        if (baseDir && baseDir !== '.') {
          const parts = baseDir.split('/').filter(Boolean);
          const up = (p.match(/\.\.\//g) || []).length;
          for (let i = 0; i < up; i++) parts.pop();
          p = [...parts, p.replace(/^(\.\.\/)+/, '')].filter(Boolean).join('/');
        } else {
          p = p.replace(/^(\.\.\/)+/, '');
        }
        if (p && !seen.has(p)) {
          seen.add(p);
          paths.push(p);
        }
      }
    }

    return paths.slice(0, 5);
  }
}
