import { CRContext, CRComment } from '../../common/types';

/**
 * Skill 执行结果
 */
export interface SkillResult {
  skillName: string;
  success: boolean;
  comments: CRComment[];
  metadata?: Record<string, any>;
  error?: string;
  executionTime?: number;
}

/**
 * Skill 配置
 */
export interface SkillConfig {
  enabled: boolean;
  timeout?: number;
  options?: Record<string, any>;
}

/**
 * Skill 接口
 * 所有 Skills 必须实现此接口
 */
export interface ISkill {
  /**
   * Skill 名称（唯一标识）
   */
  readonly name: string;

  /**
   * Skill 描述
   */
  readonly description: string;

  /**
   * Skill 支持的编程语言
   */
  readonly supportedLanguages: string[];

  /**
   * 检查是否应该执行此 Skill
   */
  shouldExecute(context: CRContext): boolean;

  /**
   * 执行 Skill
   */
  execute(context: CRContext, config?: SkillConfig): Promise<SkillResult>;
}
