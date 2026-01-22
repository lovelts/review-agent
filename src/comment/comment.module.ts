import { Module } from '@nestjs/common';
import { CommentService } from './comment.service';
import { GitlabModule } from '../gitlab/gitlab.module';

@Module({
  imports: [GitlabModule],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule {}
