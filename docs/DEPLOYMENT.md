# 部署指南

## 前置要求

1. Node.js >= 18.x
2. Cursor CLI 已安装并配置
3. GitLab Personal Access Token（需要 `api` 权限）

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写以下必需配置：

```env
GITLAB_URL=https://gitlab.com  # 或你的私有 GitLab 地址
GITLAB_TOKEN=glpat-xxxxxxxxxxxxx  # GitLab Personal Access Token
GITLAB_WEBHOOK_SECRET=your-secret-token-here  # Webhook 密钥（随机生成）
```

### 3. 验证 Cursor CLI

确保 Cursor CLI 已安装：

```bash
cursor --version
```

如果未安装，请参考 [Cursor 官方文档](https://cursor.sh) 安装。

### 4. 启动服务

开发模式：

```bash
npm run start:dev
```

生产模式：

```bash
npm run build
npm run start:prod
```

## 配置 GitLab Webhook

1. 进入 GitLab 项目设置
2. 导航到 **Settings > Webhooks**
3. 添加新的 Webhook：
   - **URL**: `http://your-server:3000/webhook/gitlab`
   - **Secret token**: 与 `.env` 中的 `GITLAB_WEBHOOK_SECRET` 一致
   - **Trigger**: 选择 "Merge request events"
4. 保存并测试 Webhook

## Docker 部署（可选）

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
```

构建和运行：

```bash
docker build -t cr-agent .
docker run -p 3000:3000 --env-file .env cr-agent
```

## 监控和日志

服务会输出详细的日志，包括：
- Webhook 接收事件
- CR Pipeline 执行状态
- 评论发布结果
- 错误信息

建议使用 PM2 或类似工具在生产环境中管理进程：

```bash
npm install -g pm2
pm2 start dist/main.js --name cr-agent
pm2 logs cr-agent
```

## 故障排查

### Webhook 未触发

1. 检查 GitLab Webhook 配置中的 URL 是否正确
2. 验证 Secret Token 是否匹配
3. 查看服务日志确认是否收到请求

### Cursor CLI 执行失败

1. 确认 Cursor CLI 已正确安装
2. 检查 API 密钥配置
3. 查看临时文件目录权限

### 评论未发布

1. 检查 GitLab Token 权限
2. 验证 MR 状态（必须是 open 状态）
3. 查看服务日志中的错误信息
