import { Module } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { EslintSkill } from './static-analysis/eslint.skill';
import { TypeScriptSkill } from './static-analysis/typescript.skill';

/**
 * Skills 模块
 * 注册所有 Skills 并提供执行服务
 */
@Module({
  providers: [
    SkillsService,
    // 静态分析 Skills
    EslintSkill,
    TypeScriptSkill,
    // 注册函数：在模块初始化时注册 Skills
    {
      provide: 'SKILLS_REGISTRATION',
      useFactory: (
        skillsService: SkillsService,
        eslint: EslintSkill,
        typescript: TypeScriptSkill,
      ) => {
        skillsService.registerSkill(eslint);
        skillsService.registerSkill(typescript);
        return true;
      },
      inject: [SkillsService, EslintSkill, TypeScriptSkill],
    },
  ],
  exports: [SkillsService],
})
export class SkillsModule {}
