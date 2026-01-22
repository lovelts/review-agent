/**
 * GitLab MR 事件类型
 */
export enum MergeRequestAction {
  OPEN = 'open',
  UPDATE = 'update',
  REOPEN = 'reopen',
}

/**
 * CR 评论严重程度
 */
export enum CommentSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  SUGGESTION = 'suggestion',
}

/**
 * GitLab MR 基本信息
 */
export interface MergeRequestInfo {
  projectId: number;
  mrIid: number;
  commitSha: string;
  sourceBranch: string;
  targetBranch: string;
  author: string;
  title: string;
  description?: string;
}

/**
 * Diff Hunk 信息
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

/**
 * 文件变更信息
 */
export interface FileChange {
  filePath: string;
  oldPath?: string;
  newFile: boolean;
  deletedFile: boolean;
  renamedFile: boolean;
  diff: string;
  hunks: DiffHunk[];
  language?: string;
}

/**
 * CR 上下文单元
 */
export interface CRContext {
  filePath: string;
  diff: string;
  contextCode: string;
  language?: string;
  oldLineStart?: number;
  newLineStart?: number;
  mrInfo: MergeRequestInfo;
}

/**
 * CR 评论
 */
export interface CRComment {
  file: string;
  line: number;
  severity: CommentSeverity;
  comment: string;
}

/**
 * CR 结果
 */
export interface CRResult {
  comments: CRComment[];
}

/**
 * GitLab Discussion 位置
 */
export interface DiscussionPosition {
  base_sha: string;
  start_sha: string;
  head_sha: string;
  old_path?: string;
  new_path: string;
  position_type: 'text' | 'image';
  old_line?: number;
  new_line: number;
}
