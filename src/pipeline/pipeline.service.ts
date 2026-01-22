import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitlabService } from '../gitlab/gitlab.service';
import { ContextService } from '../context/context.service';
import { AgentService } from '../agent/agent.service';
import { CommentService } from '../comment/comment.service';
import { MergeRequestInfo, CRContext, CRComment } from '../common/types';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private readonly maxFilesPerMR: number;
  private readonly maxConcurrentRequests: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly gitlabService: GitlabService,
    private readonly contextService: ContextService,
    private readonly agentService: AgentService,
    private readonly commentService: CommentService,
  ) {
    this.maxFilesPerMR = parseInt(
      this.configService.get<string>('MAX_FILES_PER_MR') || '50',
      10,
    );
    this.maxConcurrentRequests = parseInt(
      this.configService.get<string>('MAX_CONCURRENT_REQUESTS') || '3',
      10,
    );
  }

  /**
   * 执行完整的 CR Pipeline
   */
  async executeCRPipeline(mrInfo: MergeRequestInfo): Promise<void> {
    this.logger.log(`Starting CR pipeline for MR #${mrInfo.mrIid}`);

    try {
      // 1. 拉取 MR 变更
      const fileChanges = await this.gitlabService.getMRChanges(
        mrInfo.projectId,
        mrInfo.mrIid,
      );
      // console.log(fileChanges);
      // 2. 检查文件数量限制
      if (fileChanges.length > this.maxFilesPerMR) {
        this.logger.warn(
          `MR has ${fileChanges.length} files, exceeding limit of ${this.maxFilesPerMR}`,
        );
        // 可以选择只处理前 N 个文件，或者跳过
        fileChanges.splice(this.maxFilesPerMR);
      }

      // 3. 构建上下文
      const contexts: CRContext[] = [];
      for (const fileChange of fileChanges) {
        const fileContexts = await this.contextService.buildContexts(
          fileChange,
          mrInfo,
          mrInfo.projectId,
          mrInfo.sourceBranch,
          mrInfo.targetBranch,
        );
        contexts.push(...fileContexts);
      }

      this.logger.log(`Built ${contexts.length} CR contexts`);

      // 4. 执行 CR Agent（并发控制）
      const allComments: CRComment[] = [];
      const batches = this.chunkArray(contexts, this.maxConcurrentRequests);
      for (const batch of batches) {
        const batchPromises = batch.map((context) =>
          this.agentService.executeCR(context).catch((error) => {
            this.logger.error(`CR failed for ${context.filePath}:`, error);
            return { comments: [] };
          }),
        );

        const batchResults = await Promise.all(batchPromises);
        for (const result of batchResults) {
          allComments.push(...result.comments);
        }
      }

      this.logger.log(`Generated ${allComments.length} total comments`);

      // 5. 写回 GitLab
      if (allComments.length > 0) {
        // 获取 MR 的 commit SHA
        const { baseSha, headSha, startSha } = await this.gitlabService.getMRDetails(
          mrInfo.projectId,
          mrInfo.mrIid,
        );

        // await this.commentService.postComments(
        //   allComments,
        //   mrInfo,
        //   baseSha,
        //   startSha,
        //   headSha,
        // );

        this.logger.log(`Posted ${allComments.length} comments to GitLab`);
      } else {
        this.logger.log('No comments to post');
      }

      this.logger.log(`CR pipeline completed for MR #${mrInfo.mrIid}`);
    } catch (error) {
      this.logger.error(`CR pipeline failed:`, error);
      throw error;
    }
  }

  /**
   * 将数组分块（用于并发控制）
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
