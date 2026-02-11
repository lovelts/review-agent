import { Module, forwardRef } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AnalyzersModule } from '../analyzers/analyzers.module';

@Module({
  imports: [forwardRef(() => AnalyzersModule)],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
