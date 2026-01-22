import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { CRContext, CRResult, CRComment } from '../common/types';
import { CommentSeverity } from '../common/types';

const execAsync = promisify(exec);

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly cursorModel: string;
  private readonly cursorCliPath: string;
  private readonly tempDir: string;

  constructor(private readonly configService: ConfigService) {
    this.cursorModel = this.configService.get<string>('CURSOR_MODEL') || 'sonnet-4.5';
    this.cursorCliPath = this.configService.get<string>('CURSOR_CLI_PATH') || 'cursor';
    this.tempDir = join(process.cwd(), 'tmp', 'cr-inputs');
  }

  /**
   * 执行 CR Agent
   */
  async executeCR(context: CRContext): Promise<any> {
    this.logger.log(`Executing CR for ${context.filePath}`);

    try {
      // 确保临时目录存在
      await mkdir(this.tempDir, { recursive: true });

      // 生成输入文件
      const inputFile = await this.generateInputFile(context);
      const promptFile = await this.generatePromptFile();
      const rulesFile = await this.generateRulesFile();

      // 执行 Cursor Agent
      const result = await this.runCursorCLI(inputFile, promptFile, rulesFile);

      // 解析结果
      const crResult = this.parseResult(result);

      // 清理临时文件
      await this.cleanupFiles([inputFile, promptFile, rulesFile]);

      return crResult;
    } catch (error) {
      this.logger.error(`Failed to execute CR:`, error);
      throw error;
    }
  }

  /**
   * 生成 CR 输入文件
   */
  private async generateInputFile(context: CRContext): Promise<string> {
    const content = `# Code Review Context

## File: ${context.filePath}
## Language: ${context.language || 'unknown'}

## Diff:
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

## Instructions:
1. Review the code changes carefully
2. Identify potential issues, bugs, security vulnerabilities, performance problems, or code quality issues
3. Only comment on real issues - do NOT provide suggestions for style preferences or minor improvements
4. If there are no issues, return an empty comments array
5. Be specific and actionable in your comments

## Output Format:
You MUST respond with a valid JSON object in the following format:

\`\`\`json
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
\`\`\`

## Severity Levels:
- \`error\`: Critical issues that must be fixed (bugs, security vulnerabilities)
- \`warning\`: Important issues that should be addressed (potential bugs, performance issues)
- \`info\`: Informational comments (code quality, best practices)
- \`suggestion\`: Optional improvements

## Important:
- Return ONLY the JSON object, no additional text
- If no issues found, return: \`{"comments": []}\`
- Line numbers should refer to the NEW line numbers in the diff
- Be concise and specific
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

      if (stderr) {
        this.logger.warn(`Cursor Agent stderr: ${stderr}`);
      }

      // 清理临时 prompt 文件
      try {
        const { unlink } = await import('fs/promises');
        await unlink(promptTempFile);
      } catch {
        // 忽略清理错误
      }

      return stdout;
    } catch (error: any) {
      this.logger.error(`Cursor Agent execution failed:`, error);
      throw new Error(`Cursor Agent execution failed: ${error.message}`);
    }
  }

  /**
   * 解析 CR 结果
   */
  private parseResult(output: string): CRResult {
    try {
      // 尝试从输出中提取 JSON
      const jsonMatch = output.match(/\{[\s\S]*"comments"[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON found in Cursor CLI output');
        return { comments: [] };
      }

      const result = JSON.parse(jsonMatch[0]) as CRResult;

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
