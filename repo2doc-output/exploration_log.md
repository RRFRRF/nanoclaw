# 探索日志

---

## 迭代 1: 初始化 — 高层信息收集

- **读取文件**: `README.md`, `package.json`, `docs/SPEC.md`, `nanoclaw/CLAUDE.md`
- **目录结构**: 已收集（4 层深度，排除 node_modules/.git）
- **初步发现**:
  - Node.js 20+ / TypeScript 项目，ESM 模块
  - 核心依赖：better-sqlite3、cron-parser、pino、zod
  - 关键模式：消息通道 → SQLite → 轮询 → 容器（Claude Agent SDK）→ 响应
  - 多渠道自注册工厂模式（无内置渠道）
- **置信度**: 0.70
- **缺失**: 核心文件未读取，容器内实现，调度器细节，IPC 机制，安全凭证机制

---

## 迭代 2: 核心源码分析

- **读取文件**: `src/index.ts`, `src/container-runner.ts`
- **新发现**:
  - 消息流水线完整逻辑（存储 → 轮询 → GroupQueue → 容器）
  - 容器热复用（活跃容器可接收 follow-up 消息）
  - Volume 挂载策略（main vs 普通 Group 差异）
  - 流式输出 marker 协议（`---NANOCLAW_OUTPUT_START---`）
  - 凭证 placeholder 注入机制
- **置信度**: 0.80 (+0.10)
- **缺失**: DB 详情、IPC Watcher、GroupQueue 逻辑、AgentRunner 容器端实现

---

## 迭代 3: 数据层与 IPC 分析

- **读取文件**: `src/db.ts`, `src/ipc.ts`, `src/group-queue.ts`, `container/agent-runner/src/index.ts`
- **新发现**:
  - 7 张 SQLite 表及增量迁移策略
  - IPC 文件系统架构（messages/tasks/input 三个子目录）
  - IPC 安全授权（目录名 = 身份，非 main 限制跨 Group 操作）
  - GroupQueue：任务优先于消息、指数退避重试
  - 容器内 MessageStream（推送式 AsyncIterable）保持长连接
  - PreCompact Hook：对话归档到 conversations/
- **置信度**: 0.85 (+0.05)
- **缺失**: credential-proxy 细节、task-scheduler 调度计算

---

## 迭代 4: 安全与调度细节

- **读取文件**: `src/task-scheduler.ts`, `src/credential-proxy.ts`
- **新发现**:
  - CredentialProxy：HTTP 代理注入凭证，支持 API key 和 OAuth 两种模式
  - 调度器：interval 类型的漂移预防算法（锚定到原定时间计算）
  - 任务执行后 10s 关闭容器（区别于消息容器 30min 超时）
  - context_mode：isolated（新会话）vs group（复用当前会话）
- **置信度**: 0.90 (+0.05)
- **达到停止条件**

---

## 最终结果

| 指标 | 数值 |
|------|------|
| 总迭代次数 | 4 |
| 读取文件总数 | 16 |
| 最终置信度 | 0.90 |

### 各维度得分

| 维度 | 得分 | 说明 |
|------|------|------|
| 技术原理 | 0.92 | 核心机制（热复用、IPC、凭证代理、调度漂移预防）均已解释 |
| 代码映射 | 0.92 | 主要功能均有对应代码路径，关键函数已标注 |
| 架构可视化 | 0.85 | 含系统总览图、消息流时序图、数据流图，缺 IPC 时序图 |
| 上手指南 | 0.88 | 有推荐阅读顺序、运行步骤、调试说明 |
| 实用性 | 0.85 | 有常见修改场景指南 |

### 已分析的文件清单

| 迭代 | 文件路径 | 分析目的 |
|------|----------|----------|
| 1 | `README.md` | 项目哲学、架构概述、使用方式 |
| 1 | `package.json` | 技术栈、依赖、构建脚本 |
| 1 | `docs/SPEC.md` | 完整技术规格文档 |
| 1 | `nanoclaw/CLAUDE.md` | 项目摘要 |
| 2 | `src/index.ts` | 主编排器逻辑 |
| 2 | `src/container-runner.ts` | 容器启动、挂载、输出解析 |
| 3 | `src/db.ts` | SQLite 操作、表结构、迁移 |
| 3 | `src/ipc.ts` | IPC 文件监听、任务处理、安全授权 |
| 3 | `src/group-queue.ts` | 并发控制、热复用、重试逻辑 |
| 3 | `container/agent-runner/src/index.ts` | 容器内 Agent 执行逻辑 |
| 4 | `src/task-scheduler.ts` | 调度循环、漂移预防、context_mode |
| 4 | `src/credential-proxy.ts` | 凭证代理、两种认证模式 |
