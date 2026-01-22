import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineService } from '../pipeline/pipeline.service';
import { MergeRequestInfo } from '../common/types';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly pipelineService: PipelineService,
  ) {}

  /**
   * 验证 Webhook Token
   */
  validateToken(token: string): boolean {
    const expectedToken = this.configService.get<string>('GITLAB_WEBHOOK_SECRET');
    return token === expectedToken;
  }

  /**
   * 处理 Merge Request
   */
  async processMergeRequest(mrInfo: MergeRequestInfo): Promise<void> {
    this.logger.log(`Starting CR pipeline for MR #${mrInfo.mrIid}`);
    
    try {
      await this.pipelineService.executeCRPipeline(mrInfo);
      this.logger.log(`CR pipeline completed for MR #${mrInfo.mrIid}`);
    } catch (error) {
      this.logger.error(`CR pipeline failed for MR #${mrInfo.mrIid}:`, error);
      throw error;
    }
  }
}
