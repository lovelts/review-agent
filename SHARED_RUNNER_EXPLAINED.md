# 共享 Runner 说明

## 共享 Runner 是什么？

共享 Runner（Shared Runner）是由 **GitLab 管理员**在**实例级别**配置的 Runner，可以被所有项目使用。

## 共享 Runner 的来源

### 1. 谁配置的？

**GitLab 管理员**（通常是 DevOps 或运维人员）配置的：

```
GitLab 管理员
    ↓
在 GitLab 实例级别配置共享 Runner
    ↓
所有项目都可以使用（如果启用）
```

### 2. 在哪里配置？

管理员在 **Admin Area（管理区域）** 配置：

1. 以管理员身份登录 GitLab
2. 进入 **Admin Area**（通常需要管理员权限）
3. 导航到 **CI/CD > Runners**
4. 查看 "Instance runners"（实例 Runner）

### 3. 如何配置共享 Runner？

管理员需要：

1. **安装 GitLab Runner**
   ```bash
   # 在服务器上安装
   sudo apt-get install gitlab-runner
   ```

2. **注册为共享 Runner**
   ```bash
   sudo gitlab-runner register \
     --url "https://your-gitlab.com/" \
     --registration-token "实例级别的共享令牌" \
     --executor "docker" \
     --description "shared-runner" \
     --tag-list "shared,docker" \
     --run-untagged="true" \
     --locked="false"  # 关键：设置为 false 才能被所有项目使用
   ```

3. **获取共享令牌**
   - 管理员进入 **Admin Area > CI/CD > Runners**
   - 查看 "Registration token"（注册令牌）
   - 这个令牌是实例级别的，不是项目级别的

### 4. 普通用户如何使用？

作为普通开发者，你**不需要**配置共享 Runner，只需要：

1. 进入你的项目 **Settings > CI/CD**
2. 展开 **Runners** 部分
3. 如果看到 "Shared runners" 可用，点击 **启用共享 runners**
4. 保存设置

## 共享 Runner vs 项目专用 Runner

### 共享 Runner（Shared Runner）

```
GitLab 实例
├── 共享 Runner 1 (所有项目可用)
├── 共享 Runner 2 (所有项目可用)
└── 共享 Runner 3 (所有项目可用)
    ↓
项目 A (启用共享 Runner) ✅
项目 B (启用共享 Runner) ✅
项目 C (启用共享 Runner) ✅
```

**特点：**
- ✅ 由管理员统一管理
- ✅ 所有项目都可以使用
- ✅ 不需要每个项目单独配置
- ❌ 普通用户无法配置
- ❌ 可能资源竞争

### 项目专用 Runner（Specific Runner）

```
项目 A
└── Runner A (只属于项目 A)

项目 B
└── Runner B (只属于项目 B)
```

**特点：**
- ✅ 项目独立，资源隔离
- ✅ 普通用户可以配置
- ✅ 可以自定义配置
- ❌ 每个项目需要单独配置

## 如何查看是否有共享 Runner？

### 方法 1: 在项目中查看

1. 进入项目 **Settings > CI/CD**
2. 展开 **Runners** 部分
3. 查看 "Shared runners" 部分：
   - 如果显示 "可用" 且有 Runner 列表 → 有共享 Runner
   - 如果显示 "不可用" 或空白 → 没有共享 Runner

### 方法 2: 询问管理员

如果你没有管理员权限，可以：
- 联系 GitLab 管理员
- 询问是否有共享 Runner 可用
- 如果没有，请求配置或使用项目专用 Runner

## 为什么可能没有共享 Runner？

1. **GitLab 实例刚搭建**
   - 管理员还没有配置

2. **安全策略**
   - 公司要求每个项目使用专用 Runner

3. **资源限制**
   - 共享 Runner 资源有限，只给特定项目使用

4. **内网环境**
   - 内网 GitLab 可能没有配置共享 Runner

## 如果没有共享 Runner 怎么办？

### 选项 1: 请求管理员配置（推荐）

联系 GitLab 管理员，请求配置共享 Runner。

### 选项 2: 配置项目专用 Runner（自己动手）

按照 `GITLAB_RUNNER_SETUP.md` 中的说明，配置项目专用的 Runner。

### 选项 3: 使用 Group Runner（如果有）

如果项目属于一个 Group，可能有 Group Runner 可用。

## 总结

- **共享 Runner** = 管理员配置的，所有项目可用的 Runner
- **来源** = GitLab 管理员在实例级别配置
- **普通用户** = 只需要在项目中启用，不需要配置
- **如果没有** = 需要管理员配置，或自己配置项目专用 Runner

## 常见问题

### Q: 我是普通用户，能配置共享 Runner 吗？

A: 不能。共享 Runner 需要管理员权限在实例级别配置。

### Q: 如何知道我的 GitLab 有没有共享 Runner？

A: 进入项目 Settings > CI/CD > Runners，查看 "Shared runners" 部分。

### Q: 共享 Runner 在哪里运行？

A: 通常在 GitLab 服务器或专门的 CI/CD 服务器上，由管理员部署。

### Q: 共享 Runner 能访问内网服务吗？

A: 取决于 Runner 部署的位置。如果 Runner 在内网，可以访问内网服务；如果在公网，可能无法访问内网 IP。
