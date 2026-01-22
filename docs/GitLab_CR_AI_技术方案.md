# GitLab MR 智能代码审查（CR）机器人技术方案

## 1. 项目目标

构建一个 **基于 GitLab Merge Request 的 AI 代码审查机器人**，能够：
- 自动监听 MR
- 分析代码 Diff
- 结合团队知识库进行代码审查
- 将审查结果**精准评论到对应代码行**

适用于前端 / Node / 全栈 / 单体或微服务仓库。

---

## 2. 整体架构概览

```text
GitLab MR Webhook
        │
        ▼
CR Server（Nest.js）
        │
        ├─ 拉取 MR Diff & 文件内容
        ├─ 构建 CR 上下文
        ├─ 检索知识库（RAG）
        │
        ├─ 调用 Cursor CLI（CR Agent）
        │       │
        │       └─ 生成结构化 CR 结果（JSON）
        │
        └─ 写回 GitLab 行级评论
```

---

## 3. 技术选型

### 3.1 服务端

| 模块 | 技术 |
|----|----|
| Web Server | Nest.js |
| Webhook 接收 | GitLab Webhook |
| HTTP 客户端 | Axios |
| 任务队列（可选） | Bull / BullMQ |
| 数据库存储 | PostgreSQL / SQLite |
| 配置管理 | dotenv |

---

### 3.2 AI / Agent 层

| 能力 | 技术 |
|---|---|
| LLM 执行 | Cursor CLI |
| 模型 | Claude / GPT |
| Prompt 管理 | Markdown |
| 输出格式 | JSON Schema |

---

### 3.3 知识库（可选）

| 能力 | 技术 |
|---|---|
| 向量化 | OpenAI / Local Embedding |
| 向量数据库 | pgvector / Chroma |
| 检索方式 | Top-K Semantic Search |

---

## 4. 核心模块设计

---

### 4.1 Webhook 模块

#### 功能
- 监听 GitLab MR 事件：
  - opened
  - updated
  - reopened

#### 处理流程
1. 校验 GitLab Secret Token
2. 解析 MR 信息（projectId / mrIid / commitSha）
3. 进入 CR Pipeline

---

### 4.2 MR 数据拉取模块

#### API 使用
- `GET /projects/:id/merge_requests/:iid/changes`
- `GET /projects/:id/repository/files/:path/raw`

#### 数据内容
- 文件路径
- diff hunk
- 新旧行号
- 文件语言类型

---

### 4.3 上下文构建模块（关键）

#### 每个 CR 单元包含：
- 文件路径
- Diff 内容（限定行数）
- 上下文代码（±100 行）
- 语言类型
- MR 元信息（作者、模块）

#### 拆分策略（非常重要）
- 按 **文件**
- 按 **hunk**
- 避免一次喂整个 MR

---

### 4.4 知识库注入（RAG）

#### 知识来源
- 项目代码规范
- ESLint / Style Guide
- 架构约定
- 安全规范

#### 注入方式
```text
Diff + Context
+ Top-K 相关规范
→ CR Prompt
```

---

### 4.5 Cursor CLI 执行层（CR Agent）

#### 定位
> Cursor CLI = 智能执行器（不是服务）

#### 执行方式
```bash
cursor ask \
  --model claude-3.5-sonnet \
  --file cr_input.md \
  --file rules.md \
  --prompt cr_prompt.md
```

---

### 4.6 CR Prompt 规范（摘要）

```json
{
  "comments": [
    {
      "file": "src/user/service.ts",
      "line": 42,
      "severity": "warning",
      "comment": "这里的 null 返回可能导致调用方 NPE"
    }
  ]
}
```

---

### 4.7 GitLab 评论回写模块

#### API
- `POST /projects/:id/merge_requests/:iid/discussions`

#### 特点
- 行级评论
- 支持 severity 标签
- 避免重复评论（hash diff）

---

## 5. 安全与稳定性设计

### 5.1 防幻觉
- Prompt 强约束
- 无问题必须返回 empty
- 禁止“建议式瞎评论”

### 5.2 防 Prompt 注入
- Diff 内容 escape
- Prompt 与用户代码隔离
- 系统规则不可被覆盖

### 5.3 限流与成本控制
- MR 文件数上限
- Token 预算
- 并发限制

---


## 7. 后续演进方向

- 多 Agent（安全 / 性能 / 规范）
- 历史 MR 学习
- 团队评分系统
- VS Code / GitLab Bot UI

---

## 8. 结论

> **这是一个“工程主导 + AI 辅助”的 CR 系统**  
> Cursor CLI 非常适合作为第一阶段和核心智能层  
> 真正的稳定性、可信度来自你的系统设计

---

**文档版本**：v1.0  
**适用对象**：前端 / 全栈 / AI 工程师
