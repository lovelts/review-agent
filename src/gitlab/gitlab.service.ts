import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { FileChange, DiffHunk } from '../common/types';

@Injectable()
export class GitlabService {
  private readonly logger = new Logger(GitlabService.name);
  private readonly apiClient: AxiosInstance;
  private readonly gitlabUrl: string;
  private readonly gitlabToken: string;

  constructor(private readonly configService: ConfigService) {
    this.gitlabUrl = this.configService.get<string>('GITLAB_URL') || 'https://gitlab.com';
    this.gitlabToken = this.configService.get<string>('GITLAB_TOKEN') || '';

    // 验证配置
    if (!this.gitlabToken) {
      this.logger.warn(
        'GITLAB_TOKEN is not configured. GitLab API calls will fail. Please set GITLAB_TOKEN in .env file.',
      );
    }

    if (!this.gitlabUrl) {
      this.logger.warn(
        'GITLAB_URL is not configured. Using default: https://gitlab.com',
      );
    }

    this.apiClient = axios.create({
      baseURL: `${this.gitlabUrl}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': this.gitlabToken,
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(
      `GitLab Service initialized: URL=${this.gitlabUrl}, Token=${this.gitlabToken ? '***configured***' : 'NOT SET'}`,
    );
  }

  /**
   * 获取 MR 详细信息
   */
  async getMRDetails(projectId: number, mrIid: number): Promise<{
    baseSha: string;
    headSha: string;
    startSha: string;
  }> {
    try {
      const response = await this.apiClient.get(
        `/projects/${projectId}/merge_requests/${mrIid}`,
      );

      return {
        baseSha: response.data.diff_refs?.base_sha || response.data.target_branch,
        headSha: response.data.diff_refs?.head_sha || response.data.sha,
        startSha: response.data.diff_refs?.start_sha || response.data.sha,
      };
    } catch (error) {
      this.logger.error(`Failed to get MR details:`, error);
      throw error;
    }
  }

  /**
   * 获取完整的 MR 信息（用于手动触发）
   */
  async getFullMRInfo(projectId: number, mrIid: number): Promise<{
    projectId: number;
    mrIid: number;
    commitSha: string;
    sourceBranch: string;
    targetBranch: string;
    author: string;
    title: string;
    description?: string;
  }> {
    // 检查 token 是否配置
    if (!this.gitlabToken) {
      throw new Error(
        'GITLAB_TOKEN is not configured. Please set GITLAB_TOKEN in .env file.',
      );
    }

    try {
      const url = `/projects/${projectId}/merge_requests/${mrIid}`;
      this.logger.debug(
        `Fetching MR info: projectId=${projectId}, mrIid=${mrIid}, url=${url}`,
      );

      const response = await this.apiClient.get(url);

      return {
        projectId,
        mrIid,
        commitSha: response.data.sha || response.data.diff_refs?.head_sha || '',
        sourceBranch: response.data.source_branch || '',
        targetBranch: response.data.target_branch || '',
        author: response.data.author?.username || response.data.author?.name || '',
        title: response.data.title || '',
        description: response.data.description || '',
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      const statusCode = error.response?.status;
      const requestUrl = error.config?.url || error.request?.url;

      // 检查是否是认证错误
      if (statusCode === 401 || statusCode === 403) {
        this.logger.error(
          `Authentication failed: status=${statusCode}, url=${requestUrl}. Please check GITLAB_TOKEN.`,
        );
        throw new Error(
          `GitLab authentication failed. Please verify GITLAB_TOKEN is correct and has 'api' scope.`,
        );
      }

      // 检查是否是 404
      if (statusCode === 404) {
        this.logger.error(
          `MR not found: projectId=${projectId}, mrIid=${mrIid}, url=${requestUrl}`,
        );
        throw new Error(
          `MR not found: projectId=${projectId}, mrIid=${mrIid}. Please verify the project ID and MR IID are correct.`,
        );
      }

      this.logger.error(
        `Failed to get full MR info: projectId=${projectId}, mrIid=${mrIid}, status=${statusCode}, url=${requestUrl}, error=${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * 获取 MR 变更信息
   */
  async getMRChanges(projectId: number, mrIid: number): Promise<FileChange[]> {
    try {
      const response = await this.apiClient.get(
        `/projects/${projectId}/merge_requests/${mrIid}/changes`,
      );

      const changes = response.data.changes || [];
      const fileChanges: FileChange[] = [];

      for (const change of changes) {
        const hunks = this.parseDiffHunks(change.diff);
        const language = this.detectLanguage(change.new_path || change.old_path);

        fileChanges.push({
          filePath: change.new_path || change.old_path,
          oldPath: change.old_path,
          newFile: change.new_file,
          deletedFile: change.deleted_file,
          renamedFile: change.renamed_file,
          diff: change.diff,
          hunks,
          language,
        });
      }

      this.logger.log(`Retrieved ${fileChanges.length} file changes for MR #${mrIid}`);
      return fileChanges;
    } catch (error) {
      this.logger.error(`Failed to get MR changes:`, error);
      throw error;
    }
  }

  /**
   * 获取文件原始内容
   */
  async getFileContent(
    projectId: number,
    filePath: string,
    ref: string = 'master',
  ): Promise<string> {
    try {
      const encodedPath = encodeURIComponent(filePath);
      const response = await this.apiClient.get(
        `/projects/${projectId}/repository/files/${encodedPath}/raw`,
        {
          params: { ref },
        },
      );

      return response.data;
    } catch (error) {
      // 文件可能不存在（新文件）或已被删除
      this.logger.debug(`File ${filePath} not found at ref ${ref}`);
      return '';
    }
  }

  /**
   * 创建 MR 讨论（行级评论）
   */
  async createDiscussion(
    projectId: number,
    mrIid: number,
    position: {
      base_sha: string;
      start_sha: string;
      head_sha: string;
      old_path?: string;
      new_path: string;
      position_type: 'text';
      old_line?: number;
      new_line: number;
    },
    body: string,
  ): Promise<void> {
    try {
      await this.apiClient.post(
        `/projects/${projectId}/merge_requests/${mrIid}/discussions`,
        {
          body,
          position,
        },
      );

      this.logger.debug(`Created discussion at line ${position.new_line} in ${position.new_path}`);
    } catch (error) {
      this.logger.error(`Failed to create discussion:`, error);
      throw error;
    }
  }

  /**
   * 解析 Diff Hunk
   */
  private parseDiffHunks(diff: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lines = diff.split('\n');
    let currentHunk: DiffHunk | null = null;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        // 解析 hunk 头部: @@ -oldStart,oldLines +newStart,newLines @@
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match) {
          if (currentHunk) {
            hunks.push(currentHunk);
          }
          currentHunk = {
            oldStart: parseInt(match[1], 10),
            oldLines: parseInt(match[2] || '1', 10),
            newStart: parseInt(match[3], 10),
            newLines: parseInt(match[4] || '1', 10),
            content: line + '\n',
          };
        }
      } else if (currentHunk) {
        currentHunk.content += line + '\n';
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * 检测文件语言类型
   */
  private detectLanguage(filePath: string): string | undefined {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      swift: 'swift',
      kt: 'kotlin',
      vue: 'vue',
      html: 'html',
      css: 'css',
      scss: 'scss',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
    };

    return languageMap[ext || ''];
  }
}
