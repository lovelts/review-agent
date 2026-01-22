import { Injectable, Logger } from '@nestjs/common';
import { GitlabService } from '../gitlab/gitlab.service';
import { CRComment, MergeRequestInfo } from '../common/types';

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);
  private readonly postedComments = new Map<string, Set<string>>(); // 用于去重

  constructor(private readonly gitlabService: GitlabService) {}

  /**
   * 将 CR 评论写回 GitLab
   */
  async postComments(
    comments: CRComment[],
    mrInfo: MergeRequestInfo,
    baseSha: string,
    startSha: string,
    headSha: string,
  ): Promise<void> {
    if (comments.length === 0) {
      this.logger.log('No comments to post');
      return;
    }

    this.logger.log(`Posting ${comments.length} comments to MR #${mrInfo.mrIid}`);

    // 按文件分组
    const commentsByFile = this.groupCommentsByFile(comments);

    for (const [filePath, fileComments] of commentsByFile.entries()) {
      for (const comment of fileComments) {
        try {
          // 检查是否已发布过相同评论（去重）
          const commentKey = this.getCommentKey(filePath, comment.line, comment.comment);
          if (this.isCommentPosted(mrInfo.projectId, mrInfo.mrIid, commentKey)) {
            this.logger.debug(`Skipping duplicate comment: ${commentKey}`);
            continue;
          }

          // 构建评论内容（包含 severity 标签）
          const body = this.formatComment(comment);

          // 创建讨论
          await this.gitlabService.createDiscussion(
            mrInfo.projectId,
            mrInfo.mrIid,
            {
              base_sha: baseSha,
              start_sha: startSha,
              head_sha: headSha,
              new_path: filePath,
              position_type: 'text',
              new_line: comment.line,
            },
            body,
          );

          // 标记为已发布
          this.markCommentPosted(mrInfo.projectId, mrInfo.mrIid, commentKey);

          this.logger.debug(`Posted comment at line ${comment.line} in ${filePath}`);
        } catch (error) {
          this.logger.error(`Failed to post comment:`, error);
        }
      }
    }
  }

  /**
   * 格式化评论内容
   */
  private formatComment(comment: CRComment): string {
    const severityEmoji = {
      error: '🔴',
      warning: '🟡',
      info: '🔵',
      suggestion: '💡',
    };

    const emoji = severityEmoji[comment.severity] || '💬';
    return `${emoji} **${comment.severity.toUpperCase()}**: ${comment.comment}`;
  }

  /**
   * 按文件分组评论
   */
  private groupCommentsByFile(comments: CRComment[]): Map<string, CRComment[]> {
    const grouped = new Map<string, CRComment[]>();

    for (const comment of comments) {
      if (!grouped.has(comment.file)) {
        grouped.set(comment.file, []);
      }
      grouped.get(comment.file)!.push(comment);
    }

    return grouped;
  }

  /**
   * 生成评论唯一键（用于去重）
   */
  private getCommentKey(filePath: string, line: number, comment: string): string {
    return `${filePath}:${line}:${comment.substring(0, 50)}`;
  }

  /**
   * 检查评论是否已发布
   */
  private isCommentPosted(projectId: number, mrIid: number, commentKey: string): boolean {
    const key = `${projectId}:${mrIid}`;
    return this.postedComments.has(key) && this.postedComments.get(key)!.has(commentKey);
  }

  /**
   * 标记评论为已发布
   */
  private markCommentPosted(projectId: number, mrIid: number, commentKey: string): void {
    const key = `${projectId}:${mrIid}`;
    if (!this.postedComments.has(key)) {
      this.postedComments.set(key, new Set());
    }
    this.postedComments.get(key)!.add(commentKey);
  }
}
