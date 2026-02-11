# Analyzers 扩展指南

## 架构概述

Analyzers 系统采用插件化架构，支持轻松扩展新的代码分析工具。

```
src/analyzers/
├── interfaces/          # 接口定义
│   └── analyzer.interface.ts
├── base/                # 基类
│   └── base.analyzer.ts
├── static-analysis/     # 静态分析 Analyzers
│   ├── eslint.analyzer.ts
│   └── typescript.analyzer.ts
├── analyzers.service.ts    # Analyzers 执行器
├── analyzers.module.ts     # 模块定义
└── README.md           # 本文档
```

## 如何添加新的 Analyzer

### 步骤 1: 创建 Analyzer 类

在相应的目录下创建新的 Analyzer 文件，例如 `src/analyzers/security/semgrep.analyzer.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { BaseAnalyzer } from '../base/base.analyzer';
import { IAnalyzer, AnalyzerResult, AnalyzerConfig } from '../interfaces/analyzer.interface';
import { CRContext, CRComment, CommentSeverity } from '../../common/types';

@Injectable()
export class SemgrepAnalyzer extends BaseAnalyzer implements IAnalyzer {
  public readonly name = 'semgrep';
  public readonly description = 'Semgrep security scanning';
  public readonly supportedLanguages = ['javascript', 'typescript', 'python', 'java'];

  async execute(context: CRContext, config?: AnalyzerConfig): Promise<AnalyzerResult> {
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

### 步骤 2: 在 AnalyzersModule 中注册

在 `src/analyzers/analyzers.module.ts` 中添加：

```typescript
import { SemgrepAnalyzer } from './security/semgrep.analyzer';

// 在 AnalyzersRegistration 的 constructor 和 onModuleInit 中注入并注册
providers: [
  AnalyzersService,
  EslintAnalyzer,
  TypeScriptAnalyzer,
  SemgrepAnalyzer,
  {
    provide: AnalyzersRegistration,
    useFactory: (analyzersService, eslint, typescript, semgrep) => {
      const reg = new AnalyzersRegistration(analyzersService, eslint, typescript, semgrep);
      reg.onModuleInit();
      return reg;
    },
    inject: [AnalyzersService, EslintAnalyzer, TypeScriptAnalyzer, SemgrepAnalyzer],
  },
],
```

或使用独立的 `AnalyzersRegistration` 类并在其中注入 `SemgrepAnalyzer`，在 `onModuleInit` 中调用 `registerAnalyzer(semgrep)`。

### 步骤 3: 配置启用

在 `.env` 文件中配置：

```env
# 启用哪些 Analyzers（逗号分隔）
ENABLED_ANALYZERS=eslint,typescript,semgrep

# 是否使用 Analyzers（默认 true）
USE_ANALYZERS=true
```

## Analyzer 接口说明

### IAnalyzer 接口

```typescript
interface IAnalyzer {
  readonly name: string;                    // Analyzer 唯一标识
  readonly description: string;             // Analyzer 描述
  readonly supportedLanguages: string[];    // 支持的编程语言（空数组表示支持所有）

  shouldExecute(context: CRContext): boolean;  // 是否应该执行
  execute(context: CRContext, config?: AnalyzerConfig): Promise<AnalyzerResult>;
}
```

### AnalyzerResult 结构

```typescript
interface AnalyzerResult {
  analyzerName: string;           // Analyzer 名称
  success: boolean;            // 是否成功
  comments: CRComment[];      // 生成的评论
  metadata?: Record<string, any>;  // 元数据（可选）
  error?: string;             // 错误信息（如果失败）
  executionTime?: number;     // 执行时间（毫秒）
}
```

## 最佳实践

### 1. 使用基类

继承 `BaseAnalyzer` 可以自动获得：
- 执行时间统计
- 错误处理
- 日志记录
- 结果创建辅助方法

### 2. 错误处理

```typescript
async execute(context: CRContext, config?: AnalyzerConfig): Promise<AnalyzerResult> {
  return this.executeWithTiming(context, async () => {
    try {
      // 执行逻辑
      return this.createSuccessResult(comments);
    } catch (error) {
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

## 配置选项

### 环境变量

```env
# 启用/禁用 Analyzers
USE_ANALYZERS=true

# 启用的 Analyzers 列表（逗号分隔）
ENABLED_ANALYZERS=eslint,typescript

# 单个 Analyzer 的超时时间（毫秒）
ESLINT_TIMEOUT=10000
TYPESCRIPT_TIMEOUT=15000
```

### AnalyzerConfig

可以在运行时为每个 Analyzer 传递配置：

```typescript
const configs = new Map<string, AnalyzerConfig>();
configs.set('eslint', {
  enabled: true,
  timeout: 10000,
  options: {
    configFile: '.eslintrc.js',
  },
});

await analyzersService.executeAnalyzers(context, configs);
```

## 调试技巧

### 1. 查看注册的 Analyzers

```typescript
const all = analyzersService.getAllAnalyzers();
console.log(all.map((a) => a.name));
```

### 2. 查看执行统计

```typescript
const results = await analyzersService.executeAnalyzers(context);
const stats = analyzersService.getStatistics(results);
console.log(stats);
```

### 3. 单独测试 Analyzer

```typescript
const analyzer = new EslintAnalyzer();
const result = await analyzer.execute(context);
console.log(result);
```

## 注意事项

1. **并发执行**: 所有适用的 Analyzers 会并发执行，注意资源使用
2. **超时设置**: 为每个 Analyzer 设置合理的超时时间
3. **错误隔离**: 单个 Analyzer 失败不应影响其他 Analyzers
4. **结果去重**: AnalyzersService 会自动去重，但确保评论格式一致
5. **性能考虑**: Analyzers 执行会增加总时间，考虑异步或并行执行
