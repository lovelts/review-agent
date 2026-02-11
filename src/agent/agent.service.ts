import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { CRContext, CRResult, CRComment } from '../common/types';
import { CommentSeverity } from '../common/types';
import { AnalyzersService } from '../analyzers/analyzers.service';
import { McpToolsService } from '../mcp/mcp-tools.service';

const execAsync = promisify(exec);

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly cursorModel: string;
  private readonly cursorCliPath: string;
  private readonly tempDir: string;
  private readonly useAnalyzers: boolean;
  private readonly useMcp: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly analyzersService?: AnalyzersService,
    private readonly mcpToolsService?: McpToolsService,
  ) {
    this.cursorModel = this.configService.get<string>('CURSOR_MODEL');
    this.cursorCliPath = this.configService.get<string>('CURSOR_CLI_PATH') || 'cursor';
    this.tempDir = join(process.cwd(), 'tmp', 'cr-inputs');
    this.useAnalyzers =
      this.configService.get<string>('USE_ANALYZERS') !== 'false' && !!this.analyzersService;
    this.useMcp = this.configService.get<string>('USE_MCP') !== 'false' && !!this.mcpToolsService;
  }

  /**
   * 执行 CR Agent
   */
  async executeCR(context: CRContext): Promise<any> {
    this.logger.log(`Executing CR for ${context.filePath}`);

    try {
      // 确保临时目录存在
      await mkdir(this.tempDir, { recursive: true });

      // 1. 执行 Analyzers（如果启用）
      let analyzerComments: CRComment[] = [];
      if (this.useAnalyzers && this.analyzersService) {
        try {
          const analyzerResults = await this.analyzersService.executeAnalyzers(context);
          analyzerComments = this.analyzersService.mergeResults(analyzerResults);
          const stats = this.analyzersService.getStatistics(analyzerResults);
          this.logger.debug(
            `Analyzers executed: ${stats.successfulAnalyzers}/${stats.totalAnalyzers} successful, ${stats.totalComments} comments, avg time: ${stats.averageExecutionTime}ms`,
          );
        } catch (error) {
          this.logger.warn(`Analyzers execution failed:`, error);
        }
      }

      // 2. 动态仓库上下文（MCP：读文件/列目录/搜索）
      let dynamicContextSection = '';
      if (this.useMcp && this.mcpToolsService) {
        try {
          dynamicContextSection = await this.mcpToolsService.enrichContext(context);
          if (dynamicContextSection) {
            this.logger.debug('MCP dynamic context added');
          }
        } catch (error) {
          this.logger.warn('MCP enrichContext failed', error);
        }
      }

      // 3. 生成输入文件（包含 Analyzers 结果与动态上下文）
      const inputFile = await this.generateInputFile(
        context,
        analyzerComments,
        dynamicContextSection,
      );
      const promptFile = await this.generatePromptFile();
      const rulesFile = await this.generateRulesFile();

      // 3. 执行 Cursor Agent
      const result = await this.runCursorCLI(inputFile, promptFile, rulesFile);

      // 4. 解析结果
      const crResult = this.parseResult(result);

      // 5. 合并 Analyzers 结果和 AI 结果
      const allComments = [...analyzerComments, ...crResult.comments];

      // 清理临时文件
      await this.cleanupFiles([inputFile, promptFile, rulesFile]);

      return {
        comments: allComments,
      };
    } catch (error) {
      this.logger.error(`Failed to execute CR:`, error);
      throw error;
    }
  }

  /**
   * 生成 CR 输入文件
   */
  private async generateInputFile(
    context: CRContext,
    analyzerComments: CRComment[] = [],
    dynamicContextSection: string = '',
  ): Promise<string> {
    let analyzersSection = '';
    if (analyzerComments.length > 0) {
      analyzersSection = `## Static Analysis Results (from tools):
${analyzerComments.map((c) => `- Line ${c.line}: [${c.severity}] ${c.comment}`).join('\n')}

**Note**: These are automated tool findings. Please review them along with the code changes.

---
`;
    }

    const content = `# Code Review Context

## File: ${context.filePath}
## Language: ${context.language || 'unknown'}

${analyzersSection}${dynamicContextSection}## Diff:
\`\`\`diff
${context.diff}
\`\`\`

## Context Code (around the changes):
\`\`\`${context.language || ''}
${context.contextCode}
\`\`\`

## MR Information:
- Author: ${context.mrInfo.author}
- Title: ${context.mrInfo.title}
- Source Branch: ${context.mrInfo.sourceBranch}
- Target Branch: ${context.mrInfo.targetBranch}
`;

    const fileName = `cr-input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.md`;
    const filePath = join(this.tempDir, fileName);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * 生成 CR Prompt 文件
   */
  private async generatePromptFile(): Promise<string> {
    const content = `# Code Review Prompt

You are an expert code reviewer. Analyze the provided code diff and context, then provide code review comments.

## Language Requirement:
- All comments MUST be in Chinese (简体中文)
- Use professional and clear Chinese language
- Be concise and specific

## Instructions:
1. Review the code changes carefully
2. Identify potential issues, bugs, security vulnerabilities, performance problems, or code quality issues
3. Only comment on real issues - do NOT provide suggestions for style preferences or minor improvements
4. If there are no issues, return an empty comments array
5. Be specific and actionable in your comments (in Chinese)

## Output Format:
You MUST respond with ONLY a valid JSON object, no markdown, no code blocks, no explanations, no additional text.

The JSON format is:

{
  "comments": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "error|warning|info|suggestion",
      "comment": "Your review comment here"
    }
  ]
}

## Severity Levels:
- \`error\`: 必须修复的关键问题（bug、安全漏洞）
- \`warning\`: 应该解决的重要问题（潜在 bug、性能问题）
- \`info\`: 信息性评论（代码质量、最佳实践）
- \`suggestion\`: 可选的改进建议

## CRITICAL REQUIREMENTS:
1. Return ONLY the raw JSON object, nothing else
2. Do NOT wrap it in markdown code blocks
3. Do NOT add any explanations or text before or after the JSON
4. Do NOT use \`\`\`json or \`\`\` markers
5. If no issues found, return exactly: {"comments": []}
6. Line numbers should refer to the NEW line numbers in the diff
7. All comments MUST be in Chinese (简体中文)
8. Be concise and specific in comments

## Example Output:
Your response should start with { and end with }, containing only valid JSON:

{"comments": [{"file": "src/file.ts", "line": 42, "severity": "error", "comment": "Issue description"}]}
`;

    const fileName = `cr-prompt-${Date.now()}.md`;
    const filePath = join(this.tempDir, fileName);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * 生成规则文件（可扩展为知识库）
   */
  private async generateRulesFile(): Promise<string> {
    const content = `# Code Review Rules

## General Rules:
1. Follow security best practices
2. Avoid null pointer exceptions
3. Handle errors properly
4. Use appropriate data structures
5. Consider performance implications
6. Follow SOLID principles
7. Write clean, maintainable code

## TypeScript/JavaScript Specific:
- Use TypeScript types properly
- Avoid \`any\` type
- Handle async/await errors
- Use const/let appropriately
- Avoid memory leaks

## Common Issues to Check:
- Race conditions
- SQL injection vulnerabilities
- XSS vulnerabilities
- Missing input validation
- Resource leaks
- Infinite loops
- Off-by-one errors
`;

    const fileName = `cr-rules-${Date.now()}.md`;
    const filePath = join(this.tempDir, fileName);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * 执行 Cursor CLI
   */
  private async runCursorCLI(
    inputFile: string,
    promptFile: string,
    rulesFile: string,
  ): Promise<string> {
    // 读取所有文件内容，组合成完整的 prompt
    const [inputContent, promptContent, rulesContent] = await Promise.all([
      readFile(inputFile, 'utf-8'),
      readFile(promptFile, 'utf-8'),
      readFile(rulesFile, 'utf-8'),
    ]);

    // 组合完整的 prompt
    const fullPrompt = `${rulesContent}\n\n${promptContent}\n\n${inputContent}`;

    // 将 prompt 写入临时文件，避免命令行转义问题
    const promptTempFile = join(this.tempDir, `full-prompt-${Date.now()}.md`);
    await writeFile(promptTempFile, fullPrompt, 'utf-8');

    // 使用 cursor agent 命令
    // --print: 非交互模式，输出到控制台
    // --output-format text: 输出纯文本（因为我们的 prompt 要求返回 JSON）
    // --mode ask: 问答模式（只读，不会修改文件）
    const command = `cat "${promptTempFile}" | ${this.cursorCliPath} agent --print --output-format text --mode ask --model ${this.cursorModel}`;

    this.logger.debug(`Executing Cursor Agent command`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 180000, // 3 minutes timeout (agent may take longer)
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: {
          ...process.env,
          // 如果配置了 API Key，传入环境变量
          ...(this.configService.get<string>('CURSOR_API_KEY') && {
            CURSOR_API_KEY: this.configService.get<string>('CURSOR_API_KEY'),
          }),
        },
      });
      console.log('stdout', stdout);
      if (stderr) {
        this.logger.warn(`Cursor Agent stderr: ${stderr}`);
      }

      this.logger.debug(`Cursor Agent output length: ${stdout.length} characters`);

      // 清理临时 prompt 文件
      try {
        const { unlink } = await import('fs/promises');
        await unlink(promptTempFile);
      } catch {
        // 忽略清理错误
      }

      return stdout;
    } catch (error: any) {
      const errorDetails = {
        command: command.substring(0, 200) + '...',
        message: error.message,
        code: error.code,
        signal: error.signal,
        stdout: error.stdout?.substring(0, 500),
        stderr: error.stderr?.substring(0, 500),
      };
      this.logger.error(`Cursor Agent execution failed: ${JSON.stringify(errorDetails, null, 2)}`);
      throw new Error(`Cursor Agent execution failed: ${error.message}`);
    }
  }

  /**
   * 解析 CR 结果
   */
  private parseResult(output: string): CRResult {
    try {
      // 清理输出，移除可能的 markdown 代码块标记
      let cleanedOutput = output.trim();

      // 移除 markdown 代码块标记（如果存在）
      cleanedOutput = cleanedOutput.replace(/^```json\s*/i, '');
      cleanedOutput = cleanedOutput.replace(/^```\s*/i, '');
      cleanedOutput = cleanedOutput.replace(/\s*```$/i, '');
      cleanedOutput = cleanedOutput.trim();

      // 尝试直接解析整个输出
      let result: CRResult;
      try {
        result = JSON.parse(cleanedOutput) as CRResult;
      } catch {
        // 如果直接解析失败，尝试提取 JSON 对象
        const jsonMatch = cleanedOutput.match(/\{[\s\S]*"comments"[\s\S]*\}/);
        if (!jsonMatch) {
          // 如果仍然找不到 JSON，尝试从文本中提取结构化信息
          this.logger.warn('No JSON found in Cursor CLI output, attempting to parse text format');
          this.logger.debug(`Output preview: ${cleanedOutput.substring(0, 500)}...`);

          // 尝试从文本中提取评论（作为后备方案）
          const textComments = this.parseTextOutput(cleanedOutput);
          if (textComments.length > 0) {
            this.logger.warn(`Parsed ${textComments.length} comments from text format (fallback)`);
            return { comments: textComments };
          }

          return { comments: [] };
        }
        result = JSON.parse(jsonMatch[0]) as CRResult;
      }

      // 验证结果格式
      if (!result.comments || !Array.isArray(result.comments)) {
        this.logger.warn('Invalid result format');
        return { comments: [] };
      }

      // 验证每个评论
      const validComments: CRComment[] = [];
      for (const comment of result.comments) {
        if (
          comment.file &&
          typeof comment.line === 'number' &&
          comment.severity &&
          comment.comment
        ) {
          // 验证 severity
          if (Object.values(CommentSeverity).includes(comment.severity as CommentSeverity)) {
            validComments.push({
              file: comment.file,
              line: comment.line,
              severity: comment.severity as CommentSeverity,
              comment: comment.comment,
            });
          }
        }
      }

      this.logger.log(`Parsed ${validComments.length} valid comments`);
      return { comments: validComments };
    } catch (error) {
      this.logger.error(`Failed to parse CR result:`, error);
      return { comments: [] };
    }
  }

  /**
   * 从文本输出中解析评论（后备方案）
   * 当 Cursor 返回文本格式而不是 JSON 时使用
   */
  private parseTextOutput(output: string): CRComment[] {
    const comments: CRComment[] = [];

    // 尝试从文本中提取结构化信息
    // 匹配类似 "1. **Critical security issue (error)**: description" 的格式
    const issuePattern = /(\d+)\.\s*\*\*([^*]+?)\s*\((\w+)\)\*\*:\s*(.+?)(?=\d+\.\s*\*\*|$)/gs;

    let match;
    while ((match = issuePattern.exec(output)) !== null) {
      const severityText = match[3].toLowerCase();
      const commentText = match[4].trim();

      // 从上下文中提取文件路径和行号（如果存在）
      const fileMatch = output.substring(0, match.index).match(/file[:\s]+([^\s\n]+)/i);
      const lineMatch = output.substring(0, match.index).match(/line[:\s]+(\d+)/i);

      const file = fileMatch ? fileMatch[1] : 'unknown';
      const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;

      comments.push({
        file,
        line,
        severity: this.mapSeverity(severityText),
        comment: commentText,
      });
    }

    return comments;
  }

  /**
   * 映射文本严重程度到枚举
   */
  private mapSeverity(text: string): CommentSeverity {
    const lower = text.toLowerCase();
    if (lower.includes('error') || lower.includes('critical')) {
      return CommentSeverity.ERROR;
    }
    if (lower.includes('warning')) {
      return CommentSeverity.WARNING;
    }
    if (lower.includes('suggestion')) {
      return CommentSeverity.SUGGESTION;
    }
    return CommentSeverity.INFO;
  }

  /**
   * 清理临时文件
   */
  private async cleanupFiles(files: string[]): Promise<void> {
    const { unlink } = await import('fs/promises');
    for (const file of files) {
      try {
        await unlink(file);
      } catch (error) {
        // 忽略清理错误
        this.logger.debug(`Failed to cleanup file ${file}`);
      }
    }
  }
}
