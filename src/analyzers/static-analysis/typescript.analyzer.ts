import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { BaseAnalyzer } from '../base/base.analyzer';
import { IAnalyzer, AnalyzerResult, AnalyzerConfig } from '../interfaces/analyzer.interface';
import { CRContext, CRComment, CommentSeverity } from '../../common/types';

const execAsync = promisify(exec);

/**
 * TypeScript Analyzer
 * 执行 TypeScript 类型检查
 */
@Injectable()
export class TypeScriptAnalyzer extends BaseAnalyzer implements IAnalyzer {
  public readonly name = 'typescript';
  public readonly description = 'TypeScript type checking';
  public readonly supportedLanguages = ['typescript', 'tsx'];

  private readonly tempDir: string;

  constructor() {
    super();
    this.tempDir = join(process.cwd(), 'tmp', 'analyzers');
  }

  async execute(context: CRContext, config?: AnalyzerConfig): Promise<AnalyzerResult> {
    return this.executeWithTiming(context, async () => {
      // 检查 TypeScript 是否可用
      try {
        await execAsync('npx tsc --version');
      } catch (error) {
        return this.createFailureResult('TypeScript compiler is not available.');
      }

      // 创建临时文件
      const tempFile = join(
        this.tempDir,
        `tsc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.ts`,
      );
      try {
        // 写入代码到临时文件
        const code = context.contextCode || context.diff;
        await writeFile(tempFile, code, 'utf-8');

        // 执行 TypeScript 编译检查
        const tscCommand = `npx tsc --noEmit --skipLibCheck ${tempFile}`;
        try {
          await execAsync(tscCommand, {
            timeout: config?.timeout || 10000,
            maxBuffer: 10 * 1024 * 1024,
          });
          // 如果没有错误，返回空结果
          return this.createSuccessResult([]);
        } catch (error: any) {
          // TypeScript 有错误时会返回非零退出码
          const comments = this.parseTypeScriptOutput(error.stdout || error.stderr, context);
          return this.createSuccessResult(comments, {
            rawOutput: error.stdout || error.stderr,
          });
        }
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
   * 解析 TypeScript 错误输出
   */
  private parseTypeScriptOutput(output: string, context: CRContext): CRComment[] {
    const comments: CRComment[] = [];

    // TypeScript 错误格式: file.ts(line, col): error TS####: message
    const errorRegex = /(\d+),(\d+):\s+error\s+(TS\d+):\s+(.+)/g;
    let match;

    while ((match = errorRegex.exec(output)) !== null) {
      const line = parseInt(match[1], 10);
      const code = match[3];
      const message = match[4];

      // 计算实际行号
      const actualLine = this.calculateActualLine(
        line,
        context.newLineStart || 0,
        context.contextCode,
      );

      comments.push({
        file: context.filePath,
        line: actualLine,
        severity: CommentSeverity.ERROR,
        comment: `TypeScript Error ${code}: ${message}`,
      });
    }

    return comments;
  }

  /**
   * 计算实际行号
   */
  private calculateActualLine(
    tscLine: number,
    contextStartLine: number,
    contextCode?: string,
  ): number {
    if (contextCode && contextStartLine > 0) {
      const contextLines = contextCode.split('\n').length;
      const contextOffset = contextStartLine - Math.floor(contextLines / 2);
      return contextOffset + tscLine;
    }
    return tscLine;
  }
}
