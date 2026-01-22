# GitLab CR AI Agent

基于 GitLab Merge Request 的 AI 代码审查机器人。

## 功能特性

- ✅ 自动监听 GitLab MR 事件（opened, updated, reopened）
- ✅ 智能分析代码 Diff
- ✅ 结合团队知识库进行代码审查（可选）
- ✅ 精准评论到对应代码行
- ✅ 支持多种编程语言

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

### 3. 启动服务

```bash
# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

### 4. 配置 GitLab 集成

#### 方式 A: 使用 Webhook（如果 GitLab 可以访问服务）

在 GitLab 项目设置中配置 Webhook：
- URL: `http://your-server:3000/webhook/gitlab`
- Secret Token: 与 `.env` 中的 `GITLAB_WEBHOOK_SECRET` 一致
- 触发事件: Merge Request events

**注意**：GitLab 不允许配置内网 IP 地址，如果遇到此限制，请使用方式 B。

#### 方式 B: 使用 GitLab CI/CD（推荐，适用于内网环境）

1. 将 `.gitlab-ci.yml.example` 复制为 `.gitlab-ci.yml`
2. 修改 `CR_AGENT_URL` 为你的内网 IP
3. 提交并推送代码
4. 创建或更新 MR 时，CI/CD 会自动触发代码审查

详细说明请查看 [GITLAB_CI_SETUP.md](./docs/GITLAB_CI_SETUP.md)

## 项目结构

```
src/
├── main.ts                 # 应用入口
├── app.module.ts           # 根模块
├── webhook/                # Webhook 模块
├── gitlab/                 # GitLab API 客户端
├── context/                # 上下文构建模块
├── agent/                  # Cursor CLI 执行层
├── comment/                # 评论回写模块
├── pipeline/               # CR Pipeline
└── common/                 # 通用工具和类型
```

## 配置说明

### 必需配置

- `GITLAB_URL`: GitLab 实例地址
- `GITLAB_TOKEN`: GitLab Personal Access Token（需要 api 权限）
- `GITLAB_WEBHOOK_SECRET`: Webhook 密钥

### 可选配置

- `CURSOR_MODEL`: 使用的 AI 模型（默认: claude-3.5-sonnet）
- `MAX_FILES_PER_MR`: 每个 MR 最大文件数（默认: 50）
- `MAX_TOKENS_PER_REQUEST`: 每次请求最大 token 数（默认: 100000）

## 使用 Cursor CLI

确保已安装 Cursor CLI 并配置好 API 密钥：

```bash
# 检查 Cursor CLI 是否可用
cursor --version
```

## 文档

- [快速开始指南](./docs/QUICKSTART.md) - 5 分钟快速部署
- [架构说明](./docs/ARCHITECTURE.md) - 系统架构和模块说明
- [部署指南](./docs/DEPLOYMENT.md) - 生产环境部署说明
- [GitLab CI/CD 集成](./docs/GITLAB_CI_SETUP.md) - 通过 CI/CD 触发代码审查（适用于内网环境）
- [GitLab Runner 设置](./docs/GITLAB_RUNNER_SETUP.md) - GitLab Runner 安装和配置指南
- [技术方案](./docs/GitLab_CR_AI_技术方案.md) - 完整技术方案文档

## 工作流程

1. **Webhook 接收**: GitLab 发送 MR 事件到 `/webhook/gitlab`
2. **数据拉取**: 从 GitLab API 拉取 MR Diff 和文件内容
3. **上下文构建**: 按文件和 hunk 拆分，提取上下文代码
4. **AI 审查**: 调用 Cursor CLI 执行代码审查
5. **评论发布**: 将审查结果写回 GitLab 对应代码行

## 特性

- ✅ 自动监听 MR 事件（opened, updated, reopened）
- ✅ 智能分析代码 Diff
- ✅ 按 hunk 拆分，避免一次性处理大文件
- ✅ 精准行级评论
- ✅ 支持多种编程语言
- ✅ 并发控制，提高效率
- ✅ 评论去重，避免重复
- ✅ 可配置的审查规则

## 许可证

MIT
