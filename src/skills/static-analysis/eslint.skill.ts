import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { BaseSkill } from '../base/base.skill';
import { ISkill, SkillResult, SkillConfig } from '../interfaces/skill.interface';
import { CRContext, CRComment, CommentSeverity } from '../../common/types';

const execAsync = promisify(exec);

/**
 * ESLint Skill
 * 执行 ESLint 静态代码分析
 */
@Injectable()
export class EslintSkill extends BaseSkill implements ISkill {
  public readonly name = 'eslint';
  public readonly description = 'ESLint static code analysis';
  public readonly supportedLanguages = ['javascript', 'typescript', 'jsx', 'tsx'];

  private readonly tempDir: string;

  constructor() {
    super();
    this.tempDir = join(process.cwd(), 'tmp', 'skills');
  }

  async execute(context: CRContext, config?: SkillConfig): Promise<SkillResult> {
    return this.executeWithTiming(context, async () => {
      // 检查 ESLint 是否可用
      try {
        await execAsync('npx eslint --version');
      } catch (error) {
        return this.createFailureResult('ESLint is not available. Please install ESLint.');
      }

      // 创建临时文件
      const tempFile = join(
        this.tempDir,
        `eslint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.ts`,
      );
      try {
        // 写入代码到临时文件
        const code = context.contextCode || context.diff;
        await writeFile(tempFile, code, 'utf-8');

        // 执行 ESLint
        const eslintCommand = `npx eslint --format json --no-eslintrc ${tempFile}`;
        const { stdout, stderr } = await execAsync(eslintCommand, {
          timeout: config?.timeout || 10000,
          maxBuffer: 10 * 1024 * 1024,
        });

        // 解析 ESLint 输出
        const comments = this.parseEslintOutput(stdout, context);

        return this.createSuccessResult(comments, {
          rawOutput: stdout,
          stderr: stderr || undefined,
        });
      } catch (error: any) {
        // ESLint 可能返回非零退出码（有错误时）
        if (error.stdout) {
          const comments = this.parseEslintOutput(error.stdout, context);
          return this.createSuccessResult(comments, {
            rawOutput: error.stdout,
            stderr: error.stderr || undefined,
          });
        }
        throw error;
      } finally {
        // 清理临时文件
        try {
          await unlink(tempFile);
        } catch {
          // 忽略清理错误
        }
      }
    });
  }

  /**
   * 解析 ESLint JSON 输出
   */
  private parseEslintOutput(output: string, context: CRContext): CRComment[] {
    const comments: CRComment[] = [];

    try {
      const results = JSON.parse(output);
      if (!Array.isArray(results)) {
        return comments;
      }

      for (const fileResult of results) {
        if (!fileResult.messages || !Array.isArray(fileResult.messages)) {
          continue;
        }

        for (const message of fileResult.messages) {
          // 计算实际行号（考虑上下文偏移）
          const actualLine = this.calculateActualLine(
            message.line,
            context.newLineStart || 0,
            context.contextCode,
          );

          const severity = this.mapEslintSeverity(message.severity);
          if (severity) {
            comments.push({
              file: context.filePath,
              line: actualLine,
              severity,
              comment: `${message.message}${message.ruleId ? ` (${message.ruleId})` : ''}`,
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to parse ESLint output: ${error}`);
    }

    return comments;
  }

  /**
   * 映射 ESLint 严重程度到 CR 严重程度
   */
  private mapEslintSeverity(eslintSeverity: number): CommentSeverity | null {
    switch (eslintSeverity) {
      case 2: // error
        return CommentSeverity.ERROR;
      case 1: // warning
        return CommentSeverity.WARNING;
      default:
        return null;
    }
  }

  /**
   * 计算实际行号
   */
  private calculateActualLine(
    eslintLine: number,
    contextStartLine: number,
    contextCode?: string,
  ): number {
    // 如果上下文代码存在，需要计算偏移
    if (contextCode && contextStartLine > 0) {
      const contextLines = contextCode.split('\n').length;
      const contextOffset = contextStartLine - Math.floor(contextLines / 2);
      return contextOffset + eslintLine;
    }
    return eslintLine;
  }
}
