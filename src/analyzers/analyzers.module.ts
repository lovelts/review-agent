import { Module, Injectable, OnModuleInit } from '@nestjs/common';
import { AnalyzersService } from './analyzers.service';
import { EslintAnalyzer } from './static-analysis/eslint.analyzer';
import { TypeScriptAnalyzer } from './static-analysis/typescript.analyzer';

/** 模块初始化时注册所有 Analyzers */
@Injectable()
class AnalyzersRegistration implements OnModuleInit {
  constructor(
    private readonly analyzersService: AnalyzersService,
    private readonly eslint: EslintAnalyzer,
    private readonly typescript: TypeScriptAnalyzer,
  ) {}

  onModuleInit() {
    this.analyzersService.registerAnalyzer(this.eslint);
    this.analyzersService.registerAnalyzer(this.typescript);
  }
}

/**
 * Analyzers 模块
 * 注册所有 Analyzers 并提供执行服务
 */
@Module({
  providers: [
    AnalyzersService,
    EslintAnalyzer,
    TypeScriptAnalyzer,
    AnalyzersRegistration,
  ],
  exports: [AnalyzersService],
})
export class AnalyzersModule {}
