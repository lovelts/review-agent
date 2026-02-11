import { Module, forwardRef } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AnalyzersModule } from '../analyzers/analyzers.module';
import { McpToolsModule } from '../mcp/mcp-tools.module';

@Module({
  imports: [
    forwardRef(() => AnalyzersModule),
    forwardRef(() => McpToolsModule),
  ],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
