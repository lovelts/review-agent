# 快速开始指南

## 5 分钟快速部署

### 步骤 1: 安装依赖

```bash
npm install
```

### 步骤 2: 配置环境变量

创建 `.env` 文件：

```bash
cat > .env << EOF
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your_gitlab_token_here
GITLAB_WEBHOOK_SECRET=$(openssl rand -hex 16)
PORT=3000
CURSOR_MODEL=claude-3.5-sonnet
EOF
```

**重要**：将 `GITLAB_TOKEN` 替换为你的 GitLab Personal Access Token（需要 `api` 权限）。

### 步骤 3: 验证 Cursor CLI

```bash
cursor --version
```

如果未安装，请访问 [Cursor 官网](https://cursor.sh) 安装。

### 步骤 4: 启动服务

```bash
npm run start:dev
```

你应该看到：
```
🚀 CR Agent server is running on: http://localhost:3000
```

### 步骤 5: 配置 GitLab Webhook

1. 进入你的 GitLab 项目
2. 导航到 **Settings > Webhooks**
3. 添加新的 Webhook：
   - **URL**: `http://your-server-ip:3000/webhook/gitlab`
   - **Secret token**: 与 `.env` 中的 `GITLAB_WEBHOOK_SECRET` 一致
   - **Trigger**: 勾选 "Merge request events"
4. 点击 "Add webhook"

### 步骤 6: 测试

创建一个测试 MR，系统会自动：
1. 接收 Webhook 事件
2. 拉取 MR Diff
3. 执行代码审查
4. 在代码行上添加评论

## 验证安装

### 检查服务状态

```bash
curl http://localhost:3000/webhook/gitlab
```

应该返回 404（这是正常的，因为需要 POST 请求）。

### 查看日志

服务会输出详细日志，包括：
- Webhook 接收
- CR Pipeline 执行
- 评论发布结果

## 常见问题

### Q: Webhook 未触发？

A: 检查：
1. GitLab Webhook URL 是否正确
2. Secret Token 是否匹配
3. 服务是否正在运行
4. 防火墙是否允许访问

### Q: Cursor CLI 执行失败？

A: 检查：
1. Cursor CLI 是否已安装：`cursor --version`
2. API 密钥是否配置正确
3. 临时目录权限：`chmod -R 755 tmp/`

### Q: 评论未发布？

A: 检查：
1. GitLab Token 权限（需要 `api` 权限）
2. MR 状态（必须是 open 状态）
3. 服务日志中的错误信息

## 下一步

- 阅读 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解系统架构
- 阅读 [DEPLOYMENT.md](./DEPLOYMENT.md) 了解生产部署
- 自定义 CR 规则（编辑 `src/agent/agent.service.ts` 中的 `generateRulesFile` 方法）
