# NanoClaw Fork Branch README

这个文档只说明当前这个 fork 分支里和以下内容有关的用法：

- Terminal 交互版本
- `agent / session / container` 的对应关系
- `--mount` 工作目录挂载
- 日常启动、调试、回归测试

不展开讲原版 NanoClaw 的 WhatsApp / Telegram / Discord 等消息渠道。

## 1. 这个 fork 现在是什么

当前分支把 NanoClaw 的重点放在了命令行多 agent 工作流上：

- 你通过 terminal UI 和 agent 交互
- 每个 agent 真正执行任务时，都在独立 Docker 容器里运行
- 容器里自带 `.claude/skills`
- 可以在创建 agent 时直接挂载代码库或工作目录
- Claude 的 URL / API Key / 模型名通过环境变量传入

目标更接近：

- Claude Code
- Codex CLI
- 多 agent 并行终端控制台

## 2. 启动方式

### 正常聊天模式

```bash
npm run terminal
```

这是现在默认推荐的入口。

### 带日志模式

```bash
npm run terminal:logs
```

这个模式会把日志也显示出来，适合调试容器、session、credential proxy、重试等问题。

### 开发态

```bash
npm run terminal:dev
npm run terminal:logs:dev
```

## 3. Terminal 支持的命令

启动后，命令行里主要用这些命令：

### 新建 agent

```bash
/new <name>
```

例如：

```bash
/new repo
```

### 新建 agent 并挂载代码目录

```bash
/new <name> --mount <path>
```

例如：

```bash
/new repo --mount C:\Users\ZhuanZ\Desktop\AI_Cloning\nanoclaw
```

### 新建 agent 并挂载为可写

```bash
/new <name> --mount <path> --rw
```

例如：

```bash
/new repo --mount C:\Users\ZhuanZ\Desktop\AI_Cloning\nanoclaw --rw
```

说明：

- 不带 `--rw` 时，挂载默认按只读处理
- 带 `--rw` 时，该挂载会以读写方式提供给 agent
- `/new` 如果发现同名 agent 已存在，不会新建一份，而是更新这个 agent 的挂载配置

### 查看所有本地 agent

```bash
/agents
```

会显示：

- agent 名
- folder
- status
- session id
- 当前容器名
- 挂载信息

### 切换当前 agent

```bash
/switch <name>
```

或：

```bash
/attach <name>
```

### 不切换，直接给某个 agent 发消息

```bash
/send <name> <message>
```

### 查看当前 agent

```bash
/current
```

### 删除 agent

```bash
/delete <name>
```

这会删除：

- 注册的 agent 记录
- 该 agent 的 session 记录
- 该 agent 的 group 工作目录
- 该 agent 的 IPC 目录
- 该 agent 的 `data/sessions/<folder>` 目录

### 查看帮助

```bash
/help
```

### 退出 terminal

```bash
/quit
```

## 4. UI 行为说明

当前 terminal UI 是 Ink 版本。

界面里主要有三类消息：

- `you -> agent`
- `agent:<name>`
- `system`

另外底部会显示当前上下文：

- 当前 agent
- 当前状态
- session id
- container name

支持：

- 上下方向键浏览历史输入
- Tab 自动补全命令和 agent 名
- 流式显示 agent 输出

## 5. Agent / Session / Container 的关系

这是这个 fork 最重要的部分。

### 5.1 Agent 是持久身份

一个 terminal agent 是持久保存的。

例如你创建：

```bash
/new repo
```

系统会保存一条本地 agent 记录，大致对应：

- `name`: `repo`
- `folder`: `local-repo`
- `jid`: `local:local-repo`

只要你不 `/delete repo`，下次重启 terminal，它还在。

### 5.2 Session 是这个 agent 的对话状态

每个 agent 会持久保存 Claude session 信息：

- `sessionId`
- `resumeAt`

这部分保存在数据库和 `data/sessions/<folder>/` 相关目录中。

因此：

- 重新启动 terminal 后
- 只要远端 Claude session 还有效

同一个 agent 会继续复用之前的会话上下文，而不是每次都从零开始。

如果远端返回：

`No conversation found with session ID`

宿主会自动清掉这份失效 session，并重试一次新会话。

### 5.3 Container 不是永久身份，而是运行时实例

当前实现里，container 是运行时实例，不是永久固定对象。

也就是说：

- `agent` 是稳定的
- `session` 尽量稳定复用
- `container` 是按需启动、按需关闭、可能重建的

所以你会看到：

- 同一个 agent 名不变
- 同一个 session 往往不变
- 但 container 名可能变

这是当前设计，不是 bug。

### 5.4 为什么 container 会变化

容器会在这些情况下结束或被替换：

- 任务完成后进入 idle，后续被关闭
- terminal 重启
- 出现错误后重试
- scheduler / queue 进行任务切换
- hard timeout 或 idle timeout 生效

因此不要把 container 名当作长期主键。

真正稳定的标识应该看：

- `agent folder`
- `session id`

## 6. 当前“对应关系”应该怎么理解

最准确的理解方式是：

### 逻辑层

- 一个 `agent` 对应一个持久工作身份
- 一个 `agent` 对应一份持久 `session state`
- 一个 `agent` 对应一份持久工作区数据

### 运行层

- 一个 `agent` 在某个时刻最多只应有一个活跃容器
- 容器退出后，后续可能由新容器继续承接同一个 agent / session / 工作区

所以它不是严格意义上的：

- `agent = 永远同一个 container`

而是：

- `agent = 持久身份`
- `session = 持久对话状态`
- `container = 该身份当前的执行载体`

## 7. 工作区和挂载怎么理解

### 内建工作区

每个 agent 自己都有一份 group 工作目录，类似：

```text
groups/local-repo/
```

这个目录是容器里的：

```text
/workspace/group
```

会被持久保留。

### 额外挂载

如果你用：

```bash
/new repo --mount C:\code\my-project --rw
```

这个目录会作为额外挂载进入容器，挂到：

```text
/workspace/extra/<basename>
```

例如：

```text
C:\code\my-project
-> /workspace/extra/my-project
```

### 什么时候用挂载

建议：

- 需要分析本地代码库：用 `--mount`
- 需要让 agent 直接改本地代码：用 `--mount ... --rw`
- 只是让 agent 在自己的沙盒里写文档或临时产物：直接用默认 group 工作区

## 8. `Repo2Doc` 和远程仓库的当前规则

这个 fork 已经把 `Repo2Doc` 的远程仓库路径策略改成了持久目录优先。

现在远程仓库应该统一落到：

```text
/workspace/group/repo2doc-repos/{repo_name}
```

而不是：

- `~`
- `/tmp`
- 其他容器退出后就消失的临时目录

输出目录统一为：

```text
{repo_path}/repo2doc-output/
```

也就是说，远程仓库分析的结果现在应该能跟着 agent 工作区一起保留下来。

## 9. Auto-Continue 与长任务行为

当前分支已经补了自动续跑逻辑，目标是避免 agent 只输出：

- 计划
- JSON action
- “我接下来开始……”

然后停住等你手工发“继续”。

现在如果系统判断这轮 query 只是：

- 规划
- 委派 envelope
- 没有真正完成

会自动再推一轮 continue 指令，让 agent 接着跑。

这主要针对：

- `Repo2Doc`
- `Web2PRD`
- 长流程 skill

但要注意：

- 如果模型真的需要你提供外部输入，它仍然会停下来
- 如果远端模型/SDK本身中断，这里也不能凭空补全结果

## 10. 单实例约束

当前 terminal 服务有单实例锁。

意思是同一时间只允许一个 NanoClaw 主进程在跑，避免：

- 3001 端口冲突
- 两个 terminal 同时操作同一批 agent/session
- 容器调度状态混乱

如果你已经开了一个 terminal，再开第二个，系统会提示已有进程在运行。

## 11. 日常推荐用法

### 代码库逆向

```bash
/new repo --mount C:\Users\ZhuanZ\Desktop\AI_Cloning\nanoclaw --rw
/switch repo
使用 Repo2Doc 对这个仓库做需求逆向，结果写到持久目录里
```

### Web 自动探索

```bash
/new web
/switch web
使用 Web2PRD 探索 https://example.com，并把输出写到工作区
```

### 多 agent 并行

```bash
/new repo-a --mount C:\code\project-a --rw
/new repo-b --mount C:\code\project-b --rw
/send repo-a 分析架构
/send repo-b 分析部署流程
/agents
```

## 12. 回归测试

这个 fork 现在有两组推荐脚本。

### 按当前改动自动挑测试

```bash
npm run verify:affected
```

适合日常开发，每次改完直接跑。

它会：

- 看当前 `git status --short`
- 根据改动文件选择相关测试
- 必要时先跑 `build`

### 固定核心回归

```bash
npm run verify:core
```

适合准备提交前跑一次。

### 只跑核心测试，不单独 build

```bash
npm run test:core
```

## 13. 推荐排障顺序

如果 terminal 或 agent 行为不对，建议按这个顺序查：

1. 先看 `npm run terminal:logs`
2. 在 terminal 里执行 `/agents`
3. 看当前 agent 的：
   - `status`
   - `session`
   - `container`
   - `mounts`
4. 再看对应目录：
   - `groups/<folder>/logs/`
   - `data/sessions/<folder>/`
5. 如果怀疑 session 失效，观察是否出现：
   - `No conversation found with session ID`
6. 如果怀疑挂载问题，重新执行：
   - `/new <name> --mount <path> [--rw]`

## 14. 这个 fork 当前最适合的使用方式

最稳的方式是：

1. 用 terminal 创建 agent
2. 用 `--mount` 绑定目标代码库或工作目录
3. 把需要持久保留的结果都写到：
   - 挂载目录
   - 或 agent 自己的 `/workspace/group`
4. 用 `/agents` 观察运行状态
5. 改完代码后跑：
   - `npm run verify:affected`

如果你后面继续扩这个 fork，建议优先保持这几个原则：

- `agent` 身份稳定
- `session` 尽量复用
- `container` 可重建
- 结果必须写入持久目录
- terminal 是主入口
