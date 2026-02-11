import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IAnalyzer, AnalyzerResult, AnalyzerConfig } from './interfaces/analyzer.interface';
import { CRContext, CRComment } from '../common/types';
import { EslintAnalyzer } from './static-analysis/eslint.analyzer';
import { TypeScriptAnalyzer } from './static-analysis/typescript.analyzer';

/**
 * Analyzers 执行器服务
 * 负责注册、管理和执行所有 Analyzers
 */
@Injectable()
export class AnalyzersService implements OnModuleInit {
  private readonly logger = new Logger(AnalyzersService.name);
  private readonly analyzers = new Map<string, IAnalyzer>();
  private readonly enabledAnalyzers: string[] = [];

  constructor(
    private readonly eslint: EslintAnalyzer,
    private readonly typescript: TypeScriptAnalyzer,
  ) {}

  /**
   * 模块初始化时注册所有 Analyzers
   */
  async onModuleInit() {
    const enabledConfig = process.env.ENABLED_ANALYZERS || 'eslint,typescript';
    this.enabledAnalyzers.push(...enabledConfig.split(',').map((s) => s.trim()));
    this.logger.log(`Enabled analyzers: ${this.enabledAnalyzers.join(', ')}`);

    this.registerAnalyzer(this.eslint);
    this.registerAnalyzer(this.typescript);
  }

  /**
   * 注册 Analyzer
   */
  registerAnalyzer(analyzer: IAnalyzer): void {
    this.analyzers.set(analyzer.name, analyzer);
    this.logger.log(`Registered analyzer: ${analyzer.name} - ${analyzer.description}`);
  }

  /**
   * 获取所有注册的 Analyzers
   */
  getAllAnalyzers(): IAnalyzer[] {
    return Array.from(this.analyzers.values());
  }

  /**
   * 获取启用的 Analyzers
   */
  getEnabledAnalyzers(): IAnalyzer[] {
    return this.getAllAnalyzers().filter((a) => this.isAnalyzerEnabled(a.name));
  }

  /**
   * 检查 Analyzer 是否启用
   */
  isAnalyzerEnabled(analyzerName: string): boolean {
    return this.enabledAnalyzers.includes(analyzerName) || this.enabledAnalyzers.length === 0;
  }

  /**
   * 执行所有适用的 Analyzers
   */
  async executeAnalyzers(
    context: CRContext,
    analyzerConfigs?: Map<string, AnalyzerConfig>,
  ): Promise<AnalyzerResult[]> {
    const enabled = this.getEnabledAnalyzers();
    const applicable = enabled.filter((a) => a.shouldExecute(context));

    this.logger.debug(
      `Executing ${applicable.length} analyzers for ${context.filePath}: ${applicable.map((a) => a.name).join(', ')}`,
    );

    const results = await Promise.all(
      applicable.map(async (analyzer) => {
        const config = analyzerConfigs?.get(analyzer.name);
        try {
          return await analyzer.execute(context, config);
        } catch (error) {
          this.logger.error(`Analyzer ${analyzer.name} execution failed:`, error);
          return {
            analyzerName: analyzer.name,
            success: false,
            comments: [],
            error: error instanceof Error ? error.message : String(error),
          } as AnalyzerResult;
        }
      }),
    );

    return results;
  }

  /**
   * 合并所有 Analyzers 的结果
   */
  mergeResults(results: AnalyzerResult[]): CRComment[] {
    const allComments: CRComment[] = [];
    const seenComments = new Set<string>();

    for (const result of results) {
      if (!result.success || result.comments.length === 0) {
        continue;
      }

      for (const comment of result.comments) {
        const key = `${comment.file}:${comment.line}:${comment.comment.substring(0, 50)}`;
        if (!seenComments.has(key)) {
          seenComments.add(key);
          allComments.push({
            ...comment,
            comment: `[${result.analyzerName}] ${comment.comment}`,
          });
        }
      }
    }

    return allComments;
  }

  /**
   * 获取 Analyzer 统计信息
   */
  getStatistics(results: AnalyzerResult[]): {
    totalAnalyzers: number;
    successfulAnalyzers: number;
    failedAnalyzers: number;
    totalComments: number;
    averageExecutionTime: number;
  } {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const totalComments = results.reduce((sum, r) => sum + r.comments.length, 0);
    const totalTime = results.reduce((sum, r) => sum + (r.executionTime || 0), 0);
    const avgTime = results.length > 0 ? totalTime / results.length : 0;

    return {
      totalAnalyzers: results.length,
      successfulAnalyzers: successful.length,
      failedAnalyzers: failed.length,
      totalComments,
      averageExecutionTime: avgTime,
    };
  }
}
