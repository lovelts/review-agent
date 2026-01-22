import { Controller, Post, Headers, Body, HttpCode, HttpStatus, Logger, Get, Query } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { MergeRequestInfo } from '../common/types';
import { GitlabService } from '../gitlab/gitlab.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly gitlabService: GitlabService,
  ) {}

  @Post('gitlab')
  @HttpCode(HttpStatus.OK)
  async handleGitLabWebhook(
    @Headers('x-gitlab-token') token: string,
    @Body() payload: any,
  ) {
    this.logger.log('Received GitLab webhook');

    // 验证 token
    if (!this.webhookService.validateToken(token)) {
      this.logger.warn('Invalid webhook token');
      return { status: 'error', message: 'Invalid token' };
    }

    // 检查是否是 MR 事件
    if (payload.object_kind !== 'merge_request') {
      this.logger.debug('Not a merge request event, ignoring');
      return { status: 'ok', message: 'Not a MR event' };
    }

    // 检查事件类型
    const action = payload.object_attributes?.action;
    if (!['open', 'update', 'reopen'].includes(action)) {
      this.logger.debug(`MR action ${action} not supported, ignoring`);
      return { status: 'ok', message: 'Action not supported' };
    }

    // 提取 MR 信息
    const mrInfo: MergeRequestInfo = {
      projectId: payload.project?.id || payload.object_attributes?.target_project_id,
      mrIid: payload.object_attributes?.iid,
      commitSha: payload.object_attributes?.last_commit?.id || payload.object_attributes?.sha,
      sourceBranch: payload.object_attributes?.source_branch,
      targetBranch: payload.object_attributes?.target_branch,
      author: payload.user?.username || payload.object_attributes?.author_id?.toString(),
      title: payload.object_attributes?.title,
      description: payload.object_attributes?.description,
    };

    this.logger.log(`Processing MR #${mrInfo.mrIid} in project ${mrInfo.projectId}`);

    // 异步处理 CR Pipeline
    this.webhookService.processMergeRequest(mrInfo).catch((error) => {
      this.logger.error(`Error processing MR #${mrInfo.mrIid}:`, error);
    });

    return { status: 'ok', message: 'Webhook received' };
  }

  /**
   * 手动触发 CR（通过 GitLab CI/CD 调用）
   * 使用方式：在 .gitlab-ci.yml 中调用此 API
   *
   * @param projectId - GitLab 项目 ID（从 CI_PROJECT_ID 环境变量获取）
   * @param mrIid - Merge Request IID（从 CI_MERGE_REQUEST_IID 环境变量获取）
   */
  @Post('api/review')
  @HttpCode(HttpStatus.OK)
  async manualReview(
    @Query('projectId') projectId: string,
    @Query('mrIid') mrIid: string,
  ) {
    this.logger.log(`Manual review triggered for project ${projectId}, MR ${mrIid}`);

    const projectIdNum = parseInt(projectId, 10);
    const mrIidNum = parseInt(mrIid, 10);

    if (!projectIdNum || !mrIidNum || isNaN(projectIdNum) || isNaN(mrIidNum)) {
      this.logger.warn(`Invalid parameters: projectId=${projectId}, mrIid=${mrIid}`);
      return {
        status: 'error',
        message: 'Invalid projectId or mrIid. Both must be valid numbers.',
      };
    }

    try {
      this.logger.debug(
        `Attempting to fetch MR info: projectId=${projectIdNum}, mrIid=${mrIidNum}`,
      );
      // 从 GitLab API 获取完整的 MR 信息
      const mrInfo = await this.gitlabService.getFullMRInfo(projectIdNum, mrIidNum);
      // return mrInfo;
      this.logger.log(`Retrieved MR info: #${mrInfo.mrIid} - ${mrInfo.title}`);

      // 异步处理 CR Pipeline
      this.webhookService.processMergeRequest(mrInfo).catch((error) => {
        this.logger.error(`Error processing MR #${mrInfo.mrIid}:`, error);
      });

      return {
        status: 'ok',
        message: 'Review started',
        mrInfo: {
          projectId: mrInfo.projectId,
          mrIid: mrInfo.mrIid,
          title: mrInfo.title,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to start review:`, error);
      return {
        status: 'error',
        message: error.message || 'Failed to start review',
      };
    }
  }

  /**
   * 健康检查端点
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  healthCheck() {
    return { status: 'ok', message: 'CR Agent is running' };
  }
}
