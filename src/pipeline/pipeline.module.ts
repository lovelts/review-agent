import { Module } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { GitlabModule } from '../gitlab/gitlab.module';
import { ContextModule } from '../context/context.module';
import { AgentModule } from '../agent/agent.module';
import { CommentModule } from '../comment/comment.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [GitlabModule, ContextModule, AgentModule, CommentModule, SkillsModule],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
