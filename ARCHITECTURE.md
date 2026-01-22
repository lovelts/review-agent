# 架构说明

## 系统架构

```
┌─────────────────┐
│  GitLab MR      │
│  Webhook        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Webhook Module │  ← 验证 Token，解析 MR 事件
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Pipeline Module │  ← 协调整个 CR 流程
└────────┬────────┘
         │
         ├─► GitLab Service ──► 拉取 MR Diff & 文件内容
         │
         ├─► Context Service ──► 构建 CR 上下文（按 hunk 拆分）
         │
         ├─► Agent Service ──► 调用 Cursor CLI 执行代码审查
         │
         └─► Comment Service ──► 写回 GitLab 行级评论
```

## 模块说明

### 1. Webhook Module (`src/webhook/`)

**职责**：
- 接收 GitLab Webhook 请求
- 验证 Secret Token
- 解析 MR 事件（opened, updated, reopened）
- 触发 CR Pipeline

**关键文件**：
- `webhook.controller.ts`: 处理 HTTP 请求
- `webhook.service.ts`: 业务逻辑

### 2. GitLab Module (`src/gitlab/`)

**职责**：
- 与 GitLab API 交互
- 拉取 MR 变更信息
- 获取文件原始内容
- 创建 MR 讨论（评论）

**关键 API**：
- `GET /projects/:id/merge_requests/:iid/changes`
- `GET /projects/:id/repository/files/:path/raw`
- `POST /projects/:id/merge_requests/:iid/discussions`

### 3. Context Module (`src/context/`)

**职责**：
- 为每个文件变更构建 CR 上下文
- 按 hunk 拆分（避免一次性处理整个文件）
- 提取上下文代码（±100 行）
- 转义代码内容（防止 Prompt 注入）

**关键策略**：
- 按文件拆分
- 按 hunk 拆分
- 提取上下文代码

### 4. Agent Module (`src/agent/`)

**职责**：
- 调用 Cursor CLI 执行代码审查
- 生成 CR 输入文件
- 生成 Prompt 模板
- 解析 AI 返回的 JSON 结果

**执行流程**：
1. 生成输入文件（包含 diff 和上下文）
2. 生成 Prompt 文件（包含审查规则）
3. 调用 `cursor ask` 命令
4. 解析 JSON 结果
5. 清理临时文件

### 5. Comment Module (`src/comment/`)

**职责**：
- 将 CR 结果写回 GitLab
- 格式化评论（添加 severity 标签）
- 去重（避免重复评论）
- 按文件分组评论

**特点**：
- 行级评论
- 支持 severity 标签（error, warning, info, suggestion）
- 自动去重

### 6. Pipeline Module (`src/pipeline/`)

**职责**：
- 协调整个 CR 流程
- 控制并发数量
- 限制文件数量
- 错误处理

**执行流程**：
1. 拉取 MR 变更
2. 检查文件数量限制
3. 构建上下文（所有文件）
4. 执行 CR Agent（并发控制）
5. 收集所有评论
6. 写回 GitLab

## 数据流

```
GitLab Webhook
    ↓
MergeRequestInfo
    ↓
FileChange[] (GitLab API)
    ↓
CRContext[] (按 hunk 拆分)
    ↓
CRResult[] (Cursor CLI)
    ↓
CRComment[] (合并结果)
    ↓
GitLab Discussions (行级评论)
```

## 安全设计

### 1. 防 Prompt 注入
- 代码内容转义
- Prompt 与用户代码隔离
- 系统规则不可被覆盖

### 2. 防幻觉
- Prompt 强约束
- 无问题必须返回 empty
- 禁止"建议式瞎评论"

### 3. 限流与成本控制
- MR 文件数上限（默认 50）
- Token 预算（可配置）
- 并发限制（默认 3）

## 配置项

### 必需配置
- `GITLAB_URL`: GitLab 实例地址
- `GITLAB_TOKEN`: GitLab Personal Access Token
- `GITLAB_WEBHOOK_SECRET`: Webhook 密钥

### 可选配置
- `CURSOR_MODEL`: AI 模型（默认: claude-3.5-sonnet）
- `MAX_FILES_PER_MR`: 每个 MR 最大文件数（默认: 50）
- `MAX_CONCURRENT_REQUESTS`: 最大并发数（默认: 3）
- `PORT`: 服务端口（默认: 3000）

## 扩展点

### 1. 知识库（RAG）
可以在 `agent.service.ts` 中集成向量数据库：
- 检索相关代码规范
- 注入到 Prompt 中
- 提高审查准确性

### 2. 多 Agent
可以扩展为多个专门的 Agent：
- 安全审查 Agent
- 性能审查 Agent
- 代码规范 Agent

### 3. 历史学习
可以记录历史 MR 和评论：
- 学习团队偏好
- 改进 Prompt
- 个性化审查
