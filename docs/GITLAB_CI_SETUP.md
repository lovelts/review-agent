# GitLab CI/CD 集成说明

## 概述

由于 GitLab Webhook 不允许配置内网 IP，我们使用 GitLab CI/CD 来触发代码审查。

## 配置步骤

### 1. 在需要CR的项目根目录创建 `.gitlab-ci.yml`

将 `.gitlab-ci.yml.example` 复制为 `.gitlab-ci.yml`，并修改 `CR_AGENT_URL`：

```yaml
variables:
  CR_AGENT_URL: "http://你的内网IP:3000"
```

### 2. 确保 CR Agent 服务运行

```bash
npm run start:dev
# 或
npm run build && npm run start:prod
```

### 3. 测试连接

在 GitLab CI/CD 中手动触发 `code_review` 任务，或创建新的 MR 自动触发。

## 工作原理

1. 当创建或更新 MR 时，GitLab CI/CD 会运行 `code_review` 任务
2. CI/CD 任务调用 CR Agent 的 `/webhook/api/review` API
3. CR Agent 从 GitLab API 获取 MR 详细信息
4. 执行代码审查流程
5. 将审查结果写回 GitLab MR

## 环境变量

GitLab CI/CD 自动提供以下环境变量：
- `CI_PROJECT_ID`: 项目 ID
- `CI_MERGE_REQUEST_IID`: Merge Request IID
- `CI_COMMIT_SHA`: 当前提交 SHA

## 手动触发

如果设置了 `when: manual`，可以在 GitLab CI/CD 界面手动触发审查。

## 自动触发

移除 `when: manual` 行，CI/CD 会在每次 MR 创建或更新时自动触发审查。

## GitLab Runner 配置

**重要**：如果看到 "此作业已阻塞,因为该项目没有分配任何可用Runner" 的提示，需要先配置 GitLab Runner。

详细配置说明请查看 [GITLAB_RUNNER_SETUP.md](./GITLAB_RUNNER_SETUP.md)

## 故障排查

### Runner 未配置

如果作业一直显示 "pending" 或 "blocked"：
1. 进入项目 **Settings > CI/CD > Runners**
2. 启用共享 Runner 或配置项目专用 Runner
3. 参考 [GITLAB_RUNNER_SETUP.md](./GITLAB_RUNNER_SETUP.md) 进行配置

### 连接失败

1. 检查 CR Agent 服务是否运行
2. 检查 `CR_AGENT_URL` 是否正确
3. 检查网络连接（CI Runner 需要能访问 CR Agent）
4. 检查防火墙设置

### 审查未执行

1. 查看 GitLab CI/CD 日志
2. 查看 CR Agent 服务日志
3. 检查 GitLab Token 权限（需要 `api` 权限）
4. 验证 `CI_PROJECT_ID` 和 `CI_MERGE_REQUEST_IID` 是否正确

### 测试 API 端点

可以直接测试 API 端点：

```bash
curl -X POST "http://你的内网IP:3000/webhook/api/review?projectId=项目ID&mrIid=MR编号" \
  -H "Content-Type: application/json"
```

### 健康检查

检查服务是否运行：

```bash
curl http://你的内网IP:3000/webhook/health
```

应该返回：
```json
{"status":"ok","message":"CR Agent is running"}
```
