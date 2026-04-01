# NanoHarness 核心原理解析与教程

本教程详细解析了 NanoHarness 的目录结构、文件作用，以及其独特的对话上下文（Memory）存储管理机制。NanoHarness 是从 NanoClaw fork 而来的一个定制版本，当前已将底层运行时从 Claude Agent SDK 迁移到 Deep Agents，并专注于长流程任务执行。

## 1. 核心目录与文件解析

NanoHarness 采用模块化的设计，它的核心架构是将各大社交平台（WhatsApp、Telegram、Slack等）作为“输入控制端”，并将实际的大模型对话能力隔离在后端的 Linux 容器中运行。

*   **`src/`**：核心源代码目录
    *   **`index.ts`**：核心调度器（Orchestrator）。负责初始化数据库、启动消息轮询循环 (`startMessageLoop`)、管理状态，并在接收到新消息时触发后端的容器运行。
    *   **`db.ts`**：SQLite 数据库操作模块。通过 `better-sqlite3` 管理聊天历史、系统任务、群组注册状态等。
    *   **`container-runner.ts`**：容器运行模块。负责使用 `child_process` 唤起容器运行后端的 Deep Agents runtime，并将必要的上下文目录和组目录通过数据卷（Volumes）挂载进容器。
    *   **`container-runtime.ts`**：与底层容器运行时环境（如 Docker/Podman）交互的代码。
    *   **`router.ts` & `group-queue.ts`**：管理消息的格式化以及消息发送的阻塞队列控制。
    *   **`channels/`**：存放各个通信渠道（如 Telegram, WhatsApp）对接的逻辑实现，支持以 Skill 形式动态注册。
    *   **`types.ts`**：TypeScript 的核心数据结构类型定义。
    *   **`config.ts`**：项目内配置常量的存储地。
*   **`container/`**：容器化相关的环境代码
    *   存放代理（Agent）运行时底层的 Linux 容器构建脚本及依赖。
    *   **`skills/`**：在容器启动时被挂载到内部的特有运行时技能（Status, Browser等）。
*   **`groups/`**：群组隔离的数据环境（上下文记忆存储的关键）
    *   每个通过 NanoHarness 注册的主体会拥有一个自己的隔离文件夹，比如 `groups/main/`。
    *   在这里可以放置 `CLAUDE.md` 等文件来单独定义某一群组中 Agent 的系统指令和长期记忆。
*   **`package.json`**：定义了如 `npm run dev` 和 `npm run build` 等指令和依赖。

## 2. 对话上下文（Memory）定义与存储机制

NanoHarness 非常具有特色的一点是它采用了**双层上下文管理机制**：

### 机制一：SQLite 消息流水账（Message History）
*   **如何定义与存储**：所有的用户输入、消息都在 `src/db.ts` 中通过 `storeMessage()` 函数记录到 `messages.db` 的 `messages` 表中。
*   **如何提取**：在主控循环 `src/index.ts` 中，当 NanoHarness 探查到有新的对话更新，它会通过 `getMessagesSince()` 将时间节点以来的历史消息进行提取，并通过管道流（Piping）以 Prompt 参数的形式传入即将启动的 Linux 容器中。

### 机制二：隔离的容器级长期记忆（Persistent Claude Memory）
由于底层的 LLM 实际上是运行在容器中的 Agent runtime，NanoHarness 巧妙地利用了挂载卷（Volumes）机制来维持每一个会话的长期记忆：
*   **挂载机制**：在 `container-runner.ts` 文件的 `buildVolumeMounts` 函数中，我们可以看到 `NanoHarness` 会为每一个独立群组去创建专属的 `.claude` 文件夹（比如 `data/sessions/{group_name}/.claude`）。
*   **状态隔离**：这个专属 `.claude` 文件夹会被挂载到容器内作为 `/home/node/.claude`。
*   **记忆持久化**：这就意味着 Agent 在运算时内部写入的 `memory` 缓存文件、生成的状态均被单独写回到了宿主机的隔离文件夹中。这使得不同的群组相互之间是内存隔离且数据安全的，不仅具备连续对话能力，而且不会出现跨群组的信息污染。同时群组目录 `groups/{name}/CLAUDE.md` 也被挂载，Agent能够主动识别并吸收规则。

通过这种双规设计，NanoHarness 既拥有了即时的聊天历史记忆（SQLite），又具备了长期的项目级背景记忆和工具感知能力（利用隔离的 `.claude` 缓存目录与专门用于存放全局指令的 `CLAUDE.md`）。
