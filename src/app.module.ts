import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookModule } from './webhook/webhook.module';
import { GitlabModule } from './gitlab/gitlab.module';
import { ContextModule } from './context/context.module';
import { AgentModule } from './agent/agent.module';
import { CommentModule } from './comment/comment.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { AnalyzersModule } from './analyzers/analyzers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AnalyzersModule,
    WebhookModule,
    GitlabModule,
    ContextModule,
    AgentModule,
    CommentModule,
    PipelineModule,
  ],
})
export class AppModule {}
