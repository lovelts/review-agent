import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { PipelineModule } from '../pipeline/pipeline.module';
import { GitlabModule } from '../gitlab/gitlab.module';

@Module({
  imports: [PipelineModule, GitlabModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
