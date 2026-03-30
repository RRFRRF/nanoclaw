# NanoClaw Fork Branch 使用说明

这个分支不是原始 NanoClaw 的多消息渠道玩法，而是把它收敛成一套面向命令行的容器化多 Agent 工作流：

- 你在终端里直接和 agent 聊天
- 每个 agent 都通过容器执行任务
- 容器内预置 skill、Claude Code、Playwright CLI
- 重点支持代码库需求逆向、Web 自动探索、长期任务执行

这份文档只讲这个 fork 的实际用法，不讲原项目的 WhatsApp、Telegram、Discord 等接入。

## 1. 整体架构

当前分支可以理解成 4 层：

1. 主进程：本机运行 `npm run terminal`，负责 UI、队列、状态、日志、容器调度。
2. Agent：你在终端里创建的逻辑身份，例如 `repo`、`web`、`rrf`。
3. Session：Claude Code / Claude Agent SDK 的会话状态，用于延续上下文。
4. Container：真正执行任务的 Linux 容器实例，按需拉起，退出后可再建。

要点：

- `agent` 是持久身份。
- `session` 绑定在 agent 上，尽量复用；失效时自动重建。
- `container` 是运行时执行器，不要求永远同一个实例名，但会尽量保持单 agent 同时只跑一个容器。
- 要持久保存文件，应该写入挂载目录或 `/workspace/group`，而不是依赖容器自身文件系统。

## 2. 前置要求

建议先确认下面几项：

- Windows 10/11
- Docker Desktop 已安装并已启动
- Node.js 22
- npm 可用
- 能访问你的 Claude 兼容网关 URL
- 你已经把需要的 skills 放在：
  - `container/skills/playwright-cli`
  - `container/skills/Repo2Doc`
  - `container/skills/Web2PRD`

建议先检查：

```bash
node -v
docker version
```

如果 Docker Desktop 没启动，`npm run terminal` 可以启动主进程，但 agent 真正执行时会拉不起容器。

## 3. 构建 Docker 镜像

这个 fork 依赖一个本地镜像，默认镜像名是：

```bash
nanoclaw-agent:latest
```

在项目根目录执行：

```bash
docker build -t nanoclaw-agent:latest container
```

这个镜像当前会自动安装：

- `@anthropic-ai/claude-code`
- `agent-browser`
- `@playwright/cli@latest`
- Chromium
- Git
- 容器内 agent-runner

也就是说，你提到的 Playwright CLI 自动安装，已经是镜像构建流程的一部分。

如果你后面改了这些内容，尤其是：

- `container/Dockerfile`
- `container/agent-runner/**`
- `container/skills/**`

都应该重新构建镜像：

```bash
docker build -t nanoclaw-agent:latest container
```

如果你改了镜像 tag，就要同步修改 `.env` 里的 `CONTAINER_IMAGE`。

## 4. 配置环境变量

先复制环境变量模板：

```bash
copy .env.example .env
```

然后至少配置下面两个变量：

```dotenv
ANTHROPIC_BASE_URL=https://your-claude-compatible-endpoint
ANTHROPIC_API_KEY=your-api-key
```

当前 `.env.example` 支持这些变量：

```dotenv
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_API_KEY=sk-ant-api03-your-key

# Optional: override the main Claude Code model for agents, e.g. sonnet / opus / haiku
# ANTHROPIC_MODEL=sonnet

# Optional: pin alias resolution to exact models
# ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6
# ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6
# ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5

# Optional: model used for Claude Code subagents
# CLAUDE_CODE_SUBAGENT_MODEL=haiku

CONTAINER_IMAGE=nanoclaw-agent:latest
```

说明：

- `ANTHROPIC_BASE_URL`：Claude API 或兼容代理地址。
- `ANTHROPIC_API_KEY`：鉴权密钥。
- `ANTHROPIC_MODEL`：主模型别名或模型名。
- `ANTHROPIC_DEFAULT_*`：把别名固定到明确模型版本。
- `CLAUDE_CODE_SUBAGENT_MODEL`：Claude Code 子 agent 使用的模型。
- `CONTAINER_IMAGE`：主进程拉起 agent 容器时使用的镜像名。

注意两点：

1. Claude Agent SDK / Claude Code 这条链路本质上还是 Anthropic 体系，不是任意第三方模型都能直接替换。
2. 如果你配置了一个 Claude Code 不认识或无权限的模型名，容器会直接报模型错误。

## 5. 安装 Node 依赖

在项目根目录执行：

```bash
npm install
```

如果你刚切过 Node 版本，尤其是 `better-sqlite3` 报 native binding 错误，重新装依赖通常还不够，建议再执行一次：

```bash
npm rebuild better-sqlite3
```

如果你之前已经遇到过 `Could not locate the bindings file`，这是优先排查项。

## 6. 编译项目

安装依赖后编译：

```bash
npm run build
```

这一步会把主进程 TypeScript 编译到 `dist/`。

容器内的 `agent-runner` 不靠这里编译，它是在 Docker build 时单独编译的，所以你要区分两件事：

- `npm run build`：编译宿主机主进程
- `docker build ...`：编译并封装容器内执行器

## 7. 改动后的自检脚本

每次你改了 agent、容器、终端交互、调度逻辑后，建议按下面顺序做校验。

### 7.1 快速校验受影响范围

```bash
npm run verify:affected
```

这个脚本适合你日常改一部分代码后快速确认，没有必要每次都全量跑。

### 7.2 核心链路校验

```bash
npm run verify:core
```

这个脚本覆盖当前 fork 最重要的逻辑，包括：

- 构建
- 容器调度关键测试
- 队列 / 调度 / terminal command 测试

### 7.3 只跑核心测试

```bash
npm run test:core
```

适合你只想看测试结果，不想顺带做 build/额外检查的时候使用。

## 8. 启动方式

前面的步骤都完成后，再进入终端运行阶段。

### 8.1 正常使用模式

```bash
npm run terminal
```

这是默认入口，也是你日常应该使用的命令。

当前它是一个 Ink 风格的聊天终端，重点是聊天体验，不刷全量日志。

### 8.2 调试日志模式

```bash
npm run terminal:logs
```

这个模式同样是终端交互界面，但会把完整日志展示出来，方便排查：

- 容器拉起失败
- session 恢复失败
- skill 中途卡住
- credential proxy 报错
- mount 校验问题

### 8.3 开发态运行

如果你正在改源码，可以用：

```bash
npm run terminal:dev
npm run terminal:logs:dev
```

## 9. 终端命令

进入 `npm run terminal` 后，主要命令如下。

### 9.1 新建 agent

```bash
/new <name>
```

例如：

```bash
/new repo
```

### 9.2 新建 agent 并挂载工作目录

只读挂载：

```bash
/new <name> --mount <path>
```

例如：

```bash
/new repo --mount C:\Users\ZhuanZ\Desktop\AI_Cloning\nanoclaw
```

读写挂载：

```bash
/new <name> --mount <path> --rw
```

例如：

```bash
/new repo --mount C:\Users\ZhuanZ\Desktop\AI_Cloning\nanoclaw --rw
```

`--mount` 的意思就是把宿主机目录绑定进容器，让容器里的 agent 直接看到这个目录。

`--rw` 的意思是这个挂载目录可写；不加时默认只读。

当前 fork 已经补了自动处理逻辑：

- 如果挂载 allowlist 文件不存在，会自动创建基础配置。
- `/new ... --mount ...` 时会尝试把目标路径写入 allowlist。
- 容器创建时自动把挂载路径传进去。

### 9.3 查看所有 agent

```bash
/agents
```

当前会尽量显示这些信息：

- agent 名称
- group folder
- 运行状态
- 最近 session
- 当前容器名
- 挂载信息

### 9.4 切换当前 agent

```bash
/switch <name>
```

### 9.5 附加到 agent

```bash
/attach <name>
```

### 9.6 给指定 agent 发消息

```bash
/send <name> <message>
```

### 9.7 查看当前 agent

```bash
/current
```

### 9.8 删除 agent

```bash
/delete <name>
```

删除会清理这个 agent 对应的持久状态，包括：

- group 目录
- session 状态
- IPC 状态
- 挂载配置

### 9.9 帮助

```bash
/help
```

### 9.10 退出

```bash
/quit
```

## 10. Agent / Session / Container 的对应关系

这是这个 fork 最重要的理解点。

### 10.1 Agent 是逻辑身份

例如：

```bash
/new rrf
```

会创建一个固定身份 `rrf`。后面你再 `npm run terminal`，只要本地状态还在，这个 agent 仍然存在。

### 10.2 Session 是上下文延续

每个 agent 会记录 Claude 会话状态，核心是：

- `sessionId`
- `resumeAt`

它们会持久化到本地，用来支持：

- 重启 `npm run terminal` 之后继续聊天
- 宿主进程重启后尽量恢复上下文
- skill 长任务结束后继续追问

当前代码已经做了恢复保护：

- 如果 session 不存在，会自动作废旧 session 并新建。
- 如果 `resumeAt` 指向的 message UUID 不存在，也会自动回退恢复。
- 不再因为这类错误无限死循环重试同一个坏 session。

### 10.3 Container 是执行器，不是持久存储

真正执行任务的是容器，但容器实例名不等于 agent 身份。

当前推荐认知是：

- `agent` 持久
- `session` 尽量持久
- `container` 可重建

所以即使同一个 agent 后面拉起了新容器，也不代表上下文一定丢失。是否能续上，取决于：

- session 是否仍然有效
- 任务需要的文件是否写在持久目录中

### 10.4 持久文件应该放哪里

你要避免把重要结果只留在容器临时层里。

建议写到下面两类位置：

1. agent 自身 group 工作区
2. 你通过 `--mount` 传进去的宿主机目录

远程仓库分析、文档产出、网页探索结果，应该尽量落到这两类路径里。

## 11. 当前容器化逻辑的实际行为

### 11.1 单 agent 同时只保留一个在线执行容器

当前设计目标是：

- 一个 agent 在线运行时，不应并行拉起多个容器处理同一条上下文
- 重启 terminal 后，会优先接管已有 agent 状态
- 必要时才重建容器

这样做是为了避免：

- 多个容器抢同一 session
- 重复消费同一条消息
- 一个 agent 出现多份上下文分叉

### 11.2 terminal 进程本身也应只开一个

这个 fork 已经加了服务锁，正常使用时建议：

- 同一台机器上只运行一个 NanoClaw terminal 主进程

否则最容易出现的问题是：

- 3001 端口冲突
- 同时调度同一 agent
- 状态显示混乱

## 12. 聊天输出与流式事件

当前聊天界面不是只看最终 result，而是尽量把过程中可见的信息显示出来。

你要求的目标行为是：

1. `assistant` 文本增量流式显示到聊天区
2. `task_progress` 显示成细粒度状态行
3. `system/init` 这类内部事件只进日志
4. 最终 `result` 作为收尾，不再是唯一可见输出

这套逻辑已经是当前 fork 的方向。你在 `terminal:logs` 下能看到更完整的底层事件，普通 `terminal` 模式则偏向用户聊天体验。

## 13. Repo2Doc / Web2PRD 的使用建议

### 13.1 Repo2Doc

如果是本地仓库：

```bash
/new repo --mount C:\code\my-repo --rw
/switch repo
对这个仓库做需求逆向，使用 Repo2Doc skill
```

如果是远程仓库，当前建议把结果落到持久目录，而不是 `/tmp`。当前 fork 已经往这个方向修过，推荐认知是：

- 远程仓库 clone 后也尽量放到 `/workspace/group/...` 或你挂载的目录
- 产物文档也保存到持久路径

这样即使容器重建，结果文件也不会丢。

### 13.2 Web2PRD

```bash
/new web
/switch web
使用 Web2PRD skill 自动探索 https://example.com 并输出需求文档
```

因为镜像里已经内置 `@playwright/cli@latest`，所以容器启动后不需要再手动装 Playwright CLI。

### 13.3 为什么 skill 有时会“卡住”

常见原因不是 skill 本身失效，而是下面几类：

- 模型输出了 action 或内部思考，但没有继续推进下一轮
- 会话恢复失败
- 中间事件没有正确映射到聊天区，看起来像停住
- 结果写进了日志，没有写进聊天区

这个 fork 已经补了几类关键修复：

- auto-continue / watchdog 机制
- 区分“部分输出”和“最终完成”的重试逻辑
- skill 同步时先清目录再复制，避免旧模板残留

## 14. 推荐的完整启动流程

建议你每次在新机器或者大改后，按这个顺序来。

### 14.1 首次部署

```bash
npm install
cd container
docker build -t nanoclaw-agent:latest container
cd ..
npm run build
npm run verify:core
npm run terminal
```

### 14.2 日常开发

```bash
npm run verify:affected
npm run build
npm run terminal
```

### 14.3 排查问题

```bash
npm run terminal:logs
```

## 15. 常见问题

### 15.1 Docker Desktop 里看不到容器

如果 agent 只是被创建但还没真正执行任务，容器不会提前常驻。

只有当队列开始处理消息、真正拉起执行器时，你才会在 Docker Desktop 看到对应容器。

### 15.2 为什么重新开 terminal 后，agent 还是原来的名字，但容器名变了

因为 agent 是逻辑身份，container 是运行时实例。只要 session 和持久文件还在，就不等于上下文丢了。

### 15.3 为什么会报 `No conversation found with session ID`

这是底层 Claude 会话已经失效或本地记录过期。当前 fork 已经做了自动作废和恢复，但如果你中途更换模型、清了状态、或底层 SDK 状态本身不可恢复，还是可能重新建会话。

### 15.4 为什么会报 `No message found with message.uuid`

这是 `resumeAt` 指向的上一条 assistant message 已经不再可恢复。当前代码应该会回退并清理这类坏状态，避免一直卡死在同一 UUID 上。

### 15.5 为什么 `npm run terminal` 启动时报 3001 端口占用

说明另一份 NanoClaw 进程已经在跑，或者上次异常退出后端口还被占用。优先关闭旧进程，再重新启动。

## 16. 这个 fork 的定位

这个分支现在更接近下面这类产品形态：

- Claude Code
- Codex CLI
- 面向长期任务的容器化 agent orchestration

它不是“每条消息临时起一个一次性脚本”，而是：

- 有持久 agent 身份
- 有会话恢复
- 有容器隔离执行
- 有 skill 注入
- 有终端聊天式控制台

如果你后面继续往前推，最值得继续强化的是这 4 件事：

1. 让每个 agent 的 session 恢复更稳
2. 让 skill 的长任务中间态展示更完整
3. 让所有产物默认落到持久目录
4. 让容器重建不影响 agent 的工作连续性
