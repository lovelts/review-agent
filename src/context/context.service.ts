import { Injectable, Logger } from '@nestjs/common';
import { GitlabService } from '../gitlab/gitlab.service';
import { FileChange, CRContext, MergeRequestInfo } from '../common/types';

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  private readonly contextLines = 100; // ±100 行上下文

  constructor(private readonly gitlabService: GitlabService) {}

  /**
   * 为文件变更构建 CR 上下文
   */
  async buildContexts(
    fileChange: FileChange,
    mrInfo: MergeRequestInfo,
    projectId: number,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<CRContext[]> {
    const contexts: CRContext[] = [];

    // 如果是删除的文件，跳过
    if (fileChange.deletedFile) {
      this.logger.debug(`Skipping deleted file: ${fileChange.filePath}`);
      return contexts;
    }

    // 按 hunk 拆分
    for (const hunk of fileChange.hunks) {
      try {
        const context = await this.buildHunkContext(
          fileChange,
          hunk,
          mrInfo,
          projectId,
          sourceBranch,
          targetBranch,
        );
        contexts.push(context);
      } catch (error) {
        this.logger.error(`Failed to build context for hunk in ${fileChange.filePath}:`, error);
      }
    }

    return contexts;
  }

  /**
   * 为单个 hunk 构建上下文
   */
  private async buildHunkContext(
    fileChange: FileChange,
    hunk: any,
    mrInfo: MergeRequestInfo,
    projectId: number,
    sourceBranch: string,
    targetBranch: string,
  ): Promise<CRContext> {
    // 获取文件内容（从源分支）
    let fileContent = '';
    try {
      fileContent = await this.gitlabService.getFileContent(
        projectId,
        fileChange.filePath,
        sourceBranch,
      );
    } catch (error) {
      this.logger.debug(`Could not get file content for ${fileChange.filePath}`);
    }

    // 提取上下文代码（±contextLines 行）
    const contextCode = this.extractContextCode(fileContent, hunk.newStart, hunk.newLines);

    return {
      filePath: fileChange.filePath,
      diff: hunk.content,
      contextCode,
      language: fileChange.language,
      oldLineStart: hunk.oldStart,
      newLineStart: hunk.newStart,
      mrInfo,
    };
  }

  /**
   * 提取上下文代码
   */
  private extractContextCode(fileContent: string, lineStart: number, lineCount: number): string {
    if (!fileContent) {
      return '';
    }

    const lines = fileContent.split('\n');
    const start = Math.max(0, lineStart - this.contextLines - 1);
    const end = Math.min(lines.length, lineStart + lineCount + this.contextLines);

    return lines.slice(start, end).join('\n');
  }

  /**
   * 转义代码内容，防止 Prompt 注入
   */
  escapeCode(code: string): string {
    // 简单的转义：将代码块用标记包裹
    // 在实际使用中，应该更严格地处理特殊字符
    return code.replace(/```/g, '\\`\\`\\`').replace(/\$\{/g, '\\${');
  }
}
