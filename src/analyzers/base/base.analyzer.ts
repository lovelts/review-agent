import { Logger } from '@nestjs/common';
import { IAnalyzer, AnalyzerResult, AnalyzerConfig } from '../interfaces/analyzer.interface';
import { CRContext, CRComment } from '../../common/types';

/**
 * Analyzer 基类
 * 提供通用功能和默认实现
 */
export abstract class BaseAnalyzer implements IAnalyzer {
  protected readonly logger: Logger;
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly supportedLanguages: string[];

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * 默认实现：检查语言是否支持
   */
  shouldExecute(context: CRContext): boolean {
    if (!context.language) {
      return true; // 如果没有指定语言，默认执行
    }
    return (
      this.supportedLanguages.includes(context.language) || this.supportedLanguages.length === 0
    );
  }

  /**
   * 执行 Analyzer（子类必须实现）
   */
  abstract execute(context: CRContext, config?: AnalyzerConfig): Promise<AnalyzerResult>;

  /**
   * 记录执行时间
   */
  protected async executeWithTiming(
    context: CRContext,
    executor: () => Promise<AnalyzerResult>,
  ): Promise<AnalyzerResult> {
    const startTime = Date.now();
    try {
      const result = await executor();
      result.executionTime = Date.now() - startTime;
      return result;
    } catch (error) {
      const result: AnalyzerResult = {
        analyzerName: this.name,
        success: false,
        comments: [],
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
      this.logger.error(`Analyzer ${this.name} execution failed:`, error);
      return result;
    }
  }

  /**
   * 创建成功结果
   */
  protected createSuccessResult(
    comments: CRComment[],
    metadata?: Record<string, any>,
  ): AnalyzerResult {
    return {
      analyzerName: this.name,
      success: true,
      comments,
      metadata,
    };
  }

  /**
   * 创建失败结果
   */
  protected createFailureResult(error: string, metadata?: Record<string, any>): AnalyzerResult {
    return {
      analyzerName: this.name,
      success: false,
      comments: [],
      error,
      metadata,
    };
  }
}
