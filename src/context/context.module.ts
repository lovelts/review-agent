import { Module } from '@nestjs/common';
import { ContextService } from './context.service';
import { GitlabModule } from '../gitlab/gitlab.module';

@Module({
  imports: [GitlabModule],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
