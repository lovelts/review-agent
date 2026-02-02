# Skills 扩展指南

## 架构概述

Skills 系统采用插件化架构，支持轻松扩展新的代码分析工具。

```
src/skills/
├── interfaces/          # 接口定义
│   └── skill.interface.ts
├── base/                # 基类
│   └── base.skill.ts
├── static-analysis/     # 静态分析 Skills
│   ├── eslint.skill.ts
│   └── typescript.skill.ts
├── skills.service.ts    # Skills 执行器
├── skills.module.ts     # 模块定义
└── README.md           # 本文档
```

## 如何添加新的 Skill

### 步骤 1: 创建 Skill 类

在相应的目录下创建新的 Skill 文件，例如 `src/skills/security/semgrep.skill.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { BaseSkill } from '../base/base.skill';
import { ISkill, SkillResult, SkillConfig } from '../interfaces/skill.interface';
import { CRContext, CRComment, CommentSeverity } from '../../common/types';

@Injectable()
export class SemgrepSkill extends BaseSkill implements ISkill {
  public readonly name = 'semgrep';
  public readonly description = 'Semgrep security scanning';
  public readonly supportedLanguages = ['javascript', 'typescript', 'python', 'java'];

  async execute(context: CRContext, config?: SkillConfig): Promise<SkillResult> {
    return this.executeWithTiming(context, async () => {
      // 1. 检查工具是否可用
      // 2. 执行工具
      // 3. 解析输出
      // 4. 转换为 CRComment[]
      // 5. 返回结果
      
      const comments: CRComment[] = [];
      // ... 实现逻辑
      
      return this.createSuccessResult(comments);
    });
  }
}
```

### 步骤 2: 在 SkillsModule 中注册

在 `src/skills/skills.module.ts` 中添加：

```typescript
import { SemgrepSkill } from './security/semgrep.skill';

@Module({
  providers: [
    SkillsService,
    EslintSkill,
    TypeScriptSkill,
    SemgrepSkill,  // 新增
    {
      provide: 'SKILLS_REGISTRATION',
      useFactory: (
        skillsService: SkillsService,
        eslint: EslintSkill,
        typescript: TypeScriptSkill,
        semgrep: SemgrepSkill,  // 新增
      ) => {
        skillsService.registerSkill(eslint);
        skillsService.registerSkill(typescript);
        skillsService.registerSkill(semgrep);  // 新增
        return true;
      },
      inject: [SkillsService, EslintSkill, TypeScriptSkill, SemgrepSkill],
    },
  ],
  exports: [SkillsService],
})
export class SkillsModule {}
```

### 步骤 3: 配置启用

在 `.env` 文件中配置：

```env
# 启用哪些 Skills（逗号分隔）
ENABLED_SKILLS=eslint,typescript,semgrep

# 是否使用 Skills（默认 true）
USE_SKILLS=true
```

## Skill 接口说明

### ISkill 接口

```typescript
interface ISkill {
  readonly name: string;                    // Skill 唯一标识
  readonly description: string;             // Skill 描述
  readonly supportedLanguages: string[];    // 支持的编程语言（空数组表示支持所有）
  
  shouldExecute(context: CRContext): boolean;  // 是否应该执行
  execute(context: CRContext, config?: SkillConfig): Promise<SkillResult>;
}
```

### SkillResult 结构

```typescript
interface SkillResult {
  skillName: string;           // Skill 名称
  success: boolean;            // 是否成功
  comments: CRComment[];      // 生成的评论
  metadata?: Record<string, any>;  // 元数据（可选）
  error?: string;             // 错误信息（如果失败）
  executionTime?: number;     // 执行时间（毫秒）
}
```

## 最佳实践

### 1. 使用基类

继承 `BaseSkill` 可以自动获得：
- 执行时间统计
- 错误处理
- 日志记录
- 结果创建辅助方法

### 2. 错误处理

```typescript
async execute(context: CRContext, config?: SkillConfig): Promise<SkillResult> {
  return this.executeWithTiming(context, async () => {
    try {
      // 执行逻辑
      return this.createSuccessResult(comments);
    } catch (error) {
      // 错误会被自动捕获并记录
      throw error;  // 或者返回 createFailureResult()
    }
  });
}
```

### 3. 工具可用性检查

在执行前检查工具是否安装：

```typescript
try {
  await execAsync('npx semgrep --version');
} catch (error) {
  return this.createFailureResult('Semgrep is not available');
}
```

### 4. 临时文件管理

使用临时文件时记得清理：

```typescript
const tempFile = join(this.tempDir, `temp-${Date.now()}.ts`);
try {
  await writeFile(tempFile, code);
  // 执行工具
} finally {
  await unlink(tempFile);
}
```

### 5. 行号映射

如果工具返回的行号是相对于临时文件的，需要映射回原始文件：

```typescript
private calculateActualLine(
  toolLine: number,
  contextStartLine: number,
  contextCode?: string,
): number {
  if (contextCode && contextStartLine > 0) {
    const contextLines = contextCode.split('\n').length;
    const contextOffset = contextStartLine - Math.floor(contextLines / 2);
    return contextOffset + toolLine;
  }
  return toolLine;
}
```

## 扩展示例

### 示例 1: 安全扫描 Skill

```typescript
@Injectable()
export class SecurityScanSkill extends BaseSkill implements ISkill {
  public readonly name = 'security-scan';
  public readonly description = 'Security vulnerability scanning';
  public readonly supportedLanguages = [];

  async execute(context: CRContext): Promise<SkillResult> {
    return this.executeWithTiming(context, async () => {
      // 检查 SQL 注入、XSS 等安全问题
      const comments: CRComment[] = [];
      
      if (context.diff.includes('SELECT') && context.diff.includes('${')) {
        comments.push({
          file: context.filePath,
          line: context.newLineStart || 0,
          severity: CommentSeverity.ERROR,
          comment: 'Potential SQL injection vulnerability: Use parameterized queries',
        });
      }
      
      return this.createSuccessResult(comments);
    });
  }
}
```

### 示例 2: 性能分析 Skill

```typescript
@Injectable()
export class PerformanceAnalyzerSkill extends BaseSkill implements ISkill {
  public readonly name = 'performance';
  public readonly description = 'Performance analysis';
  public readonly supportedLanguages = ['javascript', 'typescript'];

  async execute(context: CRContext): Promise<SkillResult> {
    return this.executeWithTiming(context, async () => {
      const comments: CRComment[] = [];
      
      // 检测 N+1 查询模式
      if (this.detectNPlusOneQuery(context.diff)) {
        comments.push({
          file: context.filePath,
          line: context.newLineStart || 0,
          severity: CommentSeverity.WARNING,
          comment: 'Potential N+1 query problem detected',
        });
      }
      
      return this.createSuccessResult(comments);
    });
  }

  private detectNPlusOneQuery(diff: string): boolean {
    // 实现检测逻辑
    return false;
  }
}
```

## 配置选项

### 环境变量

```env
# 启用/禁用 Skills
USE_SKILLS=true

# 启用的 Skills 列表（逗号分隔）
ENABLED_SKILLS=eslint,typescript

# 单个 Skill 的超时时间（毫秒）
ESLINT_TIMEOUT=10000
TYPESCRIPT_TIMEOUT=15000
```

### SkillConfig

可以在运行时为每个 Skill 传递配置：

```typescript
const configs = new Map<string, SkillConfig>();
configs.set('eslint', {
  enabled: true,
  timeout: 10000,
  options: {
    configFile: '.eslintrc.js',
  },
});

await skillsService.executeSkills(context, configs);
```

## 调试技巧

### 1. 查看注册的 Skills

```typescript
const allSkills = skillsService.getAllSkills();
console.log(allSkills.map(s => s.name));
```

### 2. 查看执行统计

```typescript
const results = await skillsService.executeSkills(context);
const stats = skillsService.getStatistics(results);
console.log(stats);
```

### 3. 单独测试 Skill

```typescript
const skill = new EslintSkill();
const result = await skill.execute(context);
console.log(result);
```

## 注意事项

1. **并发执行**: 所有适用的 Skills 会并发执行，注意资源使用
2. **超时设置**: 为每个 Skill 设置合理的超时时间
3. **错误隔离**: 单个 Skill 失败不应影响其他 Skills
4. **结果去重**: SkillsService 会自动去重，但确保评论格式一致
5. **性能考虑**: Skills 执行会增加总时间，考虑异步或并行执行
