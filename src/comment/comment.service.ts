import { Injectable, Logger } from '@nestjs/common';
import { GitlabService } from '../gitlab/gitlab.service';
import { CRComment, MergeRequestInfo, FileChange } from '../common/types';

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
    fileChanges?: FileChange[],
  ): Promise<void> {
    if (comments.length === 0) {
      this.logger.log('No comments to post');
      return;
    }

    this.logger.log(`Posting ${comments.length} comments to MR #${mrInfo.mrIid}`);

    // 创建文件路径到文件变更的映射
    const fileChangeMap = new Map<string, FileChange>();
    if (fileChanges) {
      for (const fileChange of fileChanges) {
        fileChangeMap.set(fileChange.filePath, fileChange);
      }
    }

    // 按文件分组
    const commentsByFile = this.groupCommentsByFile(comments);
    // 并发掉接口可能会导致异常，改为一个一个调用
    for await (const [filePath, fileComments] of commentsByFile.entries()) {
      const fileChange = fileChangeMap.get(filePath);
      const oldPath = fileChange?.oldPath;

      for await (const comment of fileComments) {
        try {
          // 检查是否已发布过相同评论（去重）
          const commentKey = this.getCommentKey(filePath, comment.line, comment.comment);
          if (this.isCommentPosted(mrInfo.projectId, mrInfo.mrIid, commentKey)) {
            this.logger.debug(`Skipping duplicate comment: ${commentKey}`);
            continue;
          }

          // 构建评论内容（包含 severity 标签）
          const body = this.formatComment(comment);

          // 构建 position 参数
          // 对于新文件，只设置 new_path 和 new_line
          // 对于修改的文件，设置 old_path 和 old_line（如果存在）
          const position: any = {
            base_sha: baseSha,
            start_sha: startSha,
            head_sha: headSha,
            new_path: filePath,
            position_type: 'text',
            new_line: comment.line,
          };

          // 如果是重命名或移动的文件，设置 old_path
          if (oldPath && oldPath !== filePath) {
            position.old_path = oldPath;
          }

          // 对于修改的行，尝试设置 old_line（需要从 diff 中计算）
          // 注意：这里简化处理，GitLab API 可能不需要 old_line
          // 如果行号无效，GitLab 会返回 400 错误

          // 创建讨论
          await this.gitlabService.createDiscussion(mrInfo.projectId, mrInfo.mrIid, position, body);

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
