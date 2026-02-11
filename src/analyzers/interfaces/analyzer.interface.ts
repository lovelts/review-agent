import { CRContext, CRComment } from '../../common/types';

/**
 * Analyzer 执行结果
 */
export interface AnalyzerResult {
  analyzerName: string;
  success: boolean;
  comments: CRComment[];
  metadata?: Record<string, any>;
  error?: string;
  executionTime?: number;
}

/**
 * Analyzer 配置
 */
export interface AnalyzerConfig {
  enabled: boolean;
  timeout?: number;
  options?: Record<string, any>;
}

/**
 * Analyzer 接口
 * 所有 Analyzers 必须实现此接口
 */
export interface IAnalyzer {
  /**
   * Analyzer 名称（唯一标识）
   */
  readonly name: string;

  /**
   * Analyzer 描述
   */
  readonly description: string;

  /**
   * Analyzer 支持的编程语言
   */
  readonly supportedLanguages: string[];

  /**
   * 检查是否应该执行此 Analyzer
   */
  shouldExecute(context: CRContext): boolean;

  /**
   * 执行 Analyzer
   */
  execute(context: CRContext, config?: AnalyzerConfig): Promise<AnalyzerResult>;
}
