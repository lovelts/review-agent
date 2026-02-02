import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ISkill, SkillResult, SkillConfig } from './interfaces/skill.interface';
import { CRContext, CRComment } from '../common/types';

/**
 * Skills 执行器服务
 * 负责注册、管理和执行所有 Skills
 */
@Injectable()
export class SkillsService implements OnModuleInit {
  private readonly logger = new Logger(SkillsService.name);
  private readonly skills = new Map<string, ISkill>();
  private readonly enabledSkills: string[] = [];

  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * 模块初始化时注册所有 Skills
   */
  async onModuleInit() {
    // 从环境变量获取启用的 Skills
    const enabledSkillsConfig = process.env.ENABLED_SKILLS || 'eslint,typescript';
    this.enabledSkills.push(...enabledSkillsConfig.split(',').map((s) => s.trim()));

    this.logger.log(`Enabled skills: ${this.enabledSkills.join(', ')}`);
  }

  /**
   * 注册 Skill
   */
  registerSkill(skill: ISkill): void {
    this.skills.set(skill.name, skill);
    this.logger.log(`Registered skill: ${skill.name} - ${skill.description}`);
  }

  /**
   * 获取所有注册的 Skills
   */
  getAllSkills(): ISkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取启用的 Skills
   */
  getEnabledSkills(): ISkill[] {
    return this.getAllSkills().filter((skill) => this.isSkillEnabled(skill.name));
  }

  /**
   * 检查 Skill 是否启用
   */
  isSkillEnabled(skillName: string): boolean {
    return this.enabledSkills.includes(skillName) || this.enabledSkills.length === 0;
  }

  /**
   * 执行所有适用的 Skills
   */
  async executeSkills(
    context: CRContext,
    skillConfigs?: Map<string, SkillConfig>,
  ): Promise<SkillResult[]> {
    const enabledSkills = this.getEnabledSkills();
    const applicableSkills = enabledSkills.filter((skill) => skill.shouldExecute(context));

    this.logger.debug(
      `Executing ${applicableSkills.length} skills for ${context.filePath}: ${applicableSkills.map((s) => s.name).join(', ')}`,
    );

    // 并发执行所有适用的 Skills
    const results = await Promise.all(
      applicableSkills.map(async (skill) => {
        const config = skillConfigs?.get(skill.name);
        try {
          return await skill.execute(context, config);
        } catch (error) {
          this.logger.error(`Skill ${skill.name} execution failed:`, error);
          return {
            skillName: skill.name,
            success: false,
            comments: [],
            error: error instanceof Error ? error.message : String(error),
          } as SkillResult;
        }
      }),
    );

    return results;
  }

  /**
   * 合并所有 Skills 的结果
   */
  mergeResults(results: SkillResult[]): CRComment[] {
    const allComments: CRComment[] = [];
    const seenComments = new Set<string>();

    for (const result of results) {
      if (!result.success || result.comments.length === 0) {
        continue;
      }

      for (const comment of result.comments) {
        // 去重：相同文件、行号和内容
        const key = `${comment.file}:${comment.line}:${comment.comment.substring(0, 50)}`;
        if (!seenComments.has(key)) {
          seenComments.add(key);
          // 添加 Skill 来源标记
          allComments.push({
            ...comment,
            comment: `[${result.skillName}] ${comment.comment}`,
          });
        }
      }
    }

    return allComments;
  }

  /**
   * 获取 Skill 统计信息
   */
  getStatistics(results: SkillResult[]): {
    totalSkills: number;
    successfulSkills: number;
    failedSkills: number;
    totalComments: number;
    averageExecutionTime: number;
  } {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const totalComments = results.reduce((sum, r) => sum + r.comments.length, 0);
    const totalTime = results.reduce((sum, r) => sum + (r.executionTime || 0), 0);
    const avgTime = results.length > 0 ? totalTime / results.length : 0;

    return {
      totalSkills: results.length,
      successfulSkills: successful.length,
      failedSkills: failed.length,
      totalComments,
      averageExecutionTime: avgTime,
    };
  }
}
