# GitLab Runner 配置指南

## 问题说明

如果看到 "此作业已阻塞,因为该项目没有分配任何可用Runner" 的提示，说明项目还没有配置 GitLab Runner。

## 解决方案

### 方案 1: 使用共享 Runner（推荐，最简单）

如果 GitLab 实例已经配置了共享 Runner，只需要启用即可：

1. 进入项目 **Settings > CI/CD**
2. 展开 **Runners** 部分
3. 如果看到 "Shared runners" 可用，点击 **启用共享 runners**
4. 保存设置

**注意**：共享 Runner 是由 GitLab 管理员在实例级别配置的，普通用户无法自己配置。如果没有共享 Runner，需要联系管理员配置，或使用方案 2 配置项目专用 Runner。

详细说明请查看 [SHARED_RUNNER_EXPLAINED.md](./SHARED_RUNNER_EXPLAINED.md)

### 方案 2: 配置项目专用 Runner

如果需要配置项目专用的 Runner，按以下步骤操作：

#### 步骤 1: 安装 GitLab Runner

**在 Linux 服务器上安装：**

```bash
# 下载安装脚本
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash

# 安装 GitLab Runner
sudo apt-get install gitlab-runner

# 或使用 yum (CentOS/RHEL)
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.rpm.sh" | sudo bash
sudo yum install gitlab-runner
```

**在 macOS 上安装：**

```bash
brew install gitlab-runner
```

**在 Docker 中运行（推荐）：**

```bash
docker run -d --name gitlab-runner --restart always \
  -v /srv/gitlab-runner/config:/etc/gitlab-runner \
  -v /var/run/docker.sock:/var/run/docker.sock \
  gitlab/gitlab-runner:latest
```

#### 步骤 2: 注册 Runner

1. **获取注册令牌**
   - 进入项目 **Settings > CI/CD**
   - 展开 **Runners** 部分
   - 复制 **Registration token**（注册令牌）

2. **注册 Runner**

```bash
# 交互式注册
sudo gitlab-runner register

# 或使用命令行参数
sudo gitlab-runner register \
  --non-interactive \
  --url "https://your-gitlab.com/" \
  --registration-token "your-registration-token" \
  --executor "shell" \
  --description "code-review-runner" \
  --tag-list "code-review" \
  --run-untagged="true"
```

**注册时需要提供的信息：**
- **GitLab URL**: 你的 GitLab 实例地址
- **Registration token**: 从项目设置中复制的令牌
- **Executor**: 选择执行器类型
  - `shell` - 直接在服务器上执行（简单，但安全性较低）
  - `docker` - 使用 Docker 容器执行（推荐，更安全）
  - `docker+machine` - 动态创建 Docker 容器
- **Default Docker image**: 如果使用 docker executor，设置默认镜像（如 `alpine:latest`）

#### 步骤 3: 验证 Runner

```bash
# 查看 Runner 状态
sudo gitlab-runner list

# 查看 Runner 详细信息
sudo gitlab-runner verify
```

#### 步骤 4: 在项目中启用 Runner

1. 进入项目 **Settings > CI/CD**
2. 展开 **Runners** 部分
3. 在 "Specific runners" 中找到刚注册的 Runner
4. 点击 **启用** 按钮

### 方案 3: 使用 Docker Executor（推荐用于生产环境）

如果使用 Docker executor，需要修改 `.gitlab-ci.yml`：

```yaml
variables:
  CR_AGENT_URL: "http://你的内网IP:3000"

stages:
  - review

code_review:
  stage: review
  image: alpine:latest  # 使用轻量级镜像
  before_script:
    - apk add --no-cache curl  # 安装 curl
  script:
    - |
      echo "Starting code review for MR #$CI_MERGE_REQUEST_IID"
      
      response=$(curl -s -w "\n%{http_code}" -X POST \
        "$CR_AGENT_URL/webhook/api/review?projectId=$CI_PROJECT_ID&mrIid=$CI_MERGE_REQUEST_IID" \
        -H "Content-Type: application/json")
      
      http_code=$(echo "$response" | tail -n1)
      body=$(echo "$response" | sed '$d')
      
      echo "Response: $body"
      
      if [ "$http_code" -eq 200 ]; then
        echo "✅ Code review started successfully"
      else
        echo "❌ Failed to start code review (HTTP $http_code)"
        exit 1
      fi
  only:
    - merge_requests
```

### 方案 4: 使用 Shell Executor（最简单，适合内网环境）

如果使用 shell executor，确保 Runner 服务器上安装了 `curl`：

```bash
# Ubuntu/Debian
sudo apt-get install curl

# CentOS/RHEL
sudo yum install curl

# macOS
# curl 通常已预装
```

然后 `.gitlab-ci.yml` 可以保持原样（不需要 `image` 和 `before_script`）。

## 验证配置

### 1. 检查 Runner 是否可用

进入项目 **Settings > CI/CD > Runners**，应该看到：
- ✅ 至少一个 Runner 显示为 "可用"（绿色）
- Runner 标签和配置正确

### 2. 测试 CI/CD Pipeline

1. 创建一个测试 MR
2. 进入 **CI/CD > Pipelines**
3. 应该能看到 pipeline 开始运行
4. 点击 pipeline 查看作业状态

### 3. 查看 Runner 日志

如果作业失败，可以查看 Runner 日志：

```bash
# 查看 Runner 日志
sudo gitlab-runner --debug run

# 或查看系统日志
sudo journalctl -u gitlab-runner -f
```

## 常见问题

### Q: Runner 显示为 "未激活"？

A: 
1. 检查 Runner 服务是否运行：`sudo gitlab-runner status`
2. 重启 Runner：`sudo gitlab-runner restart`
3. 检查网络连接（Runner 需要能访问 GitLab）

### Q: 作业一直显示 "pending"？

A:
1. 检查 Runner 是否已启用（Settings > CI/CD > Runners）
2. 检查 Runner 标签是否匹配（如果 `.gitlab-ci.yml` 中指定了 tags）
3. 检查 Runner 是否在线：`sudo gitlab-runner verify`

### Q: Docker executor 无法连接？

A:
1. 确保 Docker 已安装并运行：`docker ps`
2. 确保 Runner 用户有权限访问 Docker
3. 检查 Docker socket 权限：`ls -l /var/run/docker.sock`

### Q: 内网环境无法访问 CR Agent？

A:
1. 确保 Runner 服务器能访问 CR Agent 的内网 IP
2. 检查防火墙设置
3. 测试连接：`curl http://CR_AGENT_IP:3000/webhook/health`

## 推荐配置

**开发/测试环境：**
- 使用 Shell Executor
- 在本地或内网服务器上运行
- 简单快速

**生产环境：**
- 使用 Docker Executor
- 隔离执行环境
- 更安全可靠

## 下一步

配置好 Runner 后：
1. 重新触发 CI/CD Pipeline
2. 查看作业是否能正常运行
3. 检查代码审查是否成功触发
