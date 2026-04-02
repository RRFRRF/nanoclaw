# NanoHarness Testing Guide

## 测试体系架构

NanoHarness 采用分层测试策略，确保从单元到端到端的完整覆盖。

```
┌─────────────────────────────────────────────────────────┐
│                    测试金字塔                            │
├─────────────────────────────────────────────────────────┤
│  E2E 测试 (10%)  - 完整业务流程                          │
│  ├── 消息生命周期测试                                    │
│  ├── 容器执行流程测试                                    │
│  └── 定时任务调度测试                                    │
├─────────────────────────────────────────────────────────┤
│  集成测试 (30%)  - 模块间交互                            │
│  ├── 流式输出集成                                        │
│  ├── 上下文压缩集成                                      │
│  ├── 多通道通信集成                                      │
│  └── 数据库操作集成                                      │
├─────────────────────────────────────────────────────────┤
│  单元测试 (60%)  - 核心逻辑                              │
│  ├── 消息路由与格式化                                    │
│  ├── 流式事件解析                                        │
│  ├── 压缩引擎                                            │
│  └── 工具函数                                            │
└─────────────────────────────────────────────────────────┘
```

## 测试目录结构

```
src/
├── __tests__/              # 单元测试
│   ├── unit/               # 纯单元测试
│   │   ├── router.test.ts
│   │   ├── formatter.test.ts
│   │   └── utils.test.ts
│   └── integration/        # 模块集成测试
│       ├── streaming.test.ts
│       ├── compact.test.ts
│       └── message-flow.test.ts
├── streaming/__tests__/    # 流式模块测试
├── compact/__tests__/      # 压缩模块测试
├── channels/__tests__/     # 通道模块测试
└── e2e/                    # 端到端测试
    ├── message-lifecycle.test.ts
    ├── container-execution.test.ts
    └── scheduled-task.test.ts
```

## 核心测试策略

### 1. 消息生命周期测试 (E2E)

测试完整的消息处理流程：

```typescript
// e2e/message-lifecycle.test.ts
describe('Message Lifecycle', () => {
  it('should process message from receive to response', async () => {
    // 1. 模拟接收消息
    const message = createTestMessage({
      content: '@Andy analyze this code',
      chat_jid: 'test-group@example.com',
    });

    // 2. 触发消息处理
    await processIncomingMessage(message);

    // 3. 验证消息存储
    const storedMessages = await getMessagesSince(message.chat_jid, '0');
    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0].content).toBe(message.content);

    // 4. 验证容器被调用
    expect(mockRunContainerAgent).toHaveBeenCalled();
    expect(mockRunContainerAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        groupFolder: expect.any(String),
        prompt: expect.stringContaining(message.content),
      })
    );

    // 5. 验证响应发送
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it('should handle streaming output correctly', async () => {
    const message = createTestMessage({ content: '@Andy long task' });
    const streamEvents: StreamEvent[] = [];

    // 捕获流式事件
    mockOnStreamEvent.mockImplementation((event) => {
      streamEvents.push(event);
    });

    await processIncomingMessage(message);

    // 验证流式事件序列
    expect(streamEvents).toContainEqual(
      expect.objectContaining({ type: 'thinking' })
    );
    expect(streamEvents).toContainEqual(
      expect.objectContaining({ type: 'plan' })
    );
    expect(streamEvents[streamEvents.length - 1]).toMatchObject({
      type: 'complete',
    });
  });

  it('should handle context compression for long conversations', async () => {
    // 创建长对话
    const messages = await createLongConversation(100);

    // 验证压缩触发
    const result = compactEngine.compact(messages, 'test-session');

    expect(result.level).not.toBe(CompressionLevel.NONE);
    expect(result.stats.tokensAfter).toBeLessThan(result.stats.tokensBefore);
  });
});
```

### 2. 容器执行流程测试 (Integration)

测试容器运行的完整流程：

```typescript
// src/__tests__/integration/container-execution.test.ts
describe('Container Execution Flow', () => {
  it('should spawn container with correct mounts', async () => {
    const group = createTestGroup({
      folder: 'test-group',
      isMain: true,
    });

    const input: ContainerInput = {
      prompt: 'test prompt',
      groupFolder: group.folder,
      chatJid: 'test@example.com',
      isMain: true,
    };

    await runContainerAgent(group, input, onProcess);

    // 验证容器参数
    const spawnCall = vi.mocked(spawn).mock.calls[0];
    const args = spawnCall[1] as string[];

    // 验证挂载点
    expect(args).toContain('-v');
    expect(args.some(a => a.includes('/workspace/group'))).toBe(true);
    expect(args.some(a => a.includes('/workspace/ipc'))).toBe(true);

    // 验证环境变量
    expect(args).toContain(`-e TZ=${TIMEZONE}`);
    expect(args).toContain(`-e MODEL_PROVIDER=${detectProvider()}`);
  });

  it('should handle streaming events from container', async () => {
    const streamEvents: StreamEvent[] = [];

    const group = createTestGroup();
    const input: ContainerInput = {
      prompt: 'test',
      enableStreaming: true,
    };

    // 模拟容器输出流式事件
    mockContainerStdout.write(`
<<<THINKING>>>
{"type":"thinking","timestamp":"2024-01-01T00:00:00Z","data":{"content":"Analyzing"}}
<<<THINKING_END>>>
<<<PLAN>>>
{"type":"plan","timestamp":"2024-01-01T00:00:01Z","data":{"steps":[{"id":"1","description":"Step 1","status":"pending"}]}}
<<<PLAN_END>>>
    `);

    await runContainerAgent(
      group,
      input,
      onProcess,
      undefined,
      async (event) => streamEvents.push(event)
    );

    expect(streamEvents).toHaveLength(2);
    expect(streamEvents[0].type).toBe('thinking');
    expect(streamEvents[1].type).toBe('plan');
  });

  it('should handle container timeout gracefully', async () => {
    const group = createTestGroup({
      containerConfig: { timeout: 100 }, // 100ms 超时
    });

    // 模拟超时
    mockContainerProcess.emit('timeout');

    const result = await runContainerAgent(group, input, onProcess);

    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
  });

  it('should resume session from sessionId', async () => {
    const sessionId = 'test-session-123';
    const group = createTestGroup();

    const input: ContainerInput = {
      prompt: 'continue',
      sessionId,
      resumeAt: 'some-uuid',
    };

    await runContainerAgent(group, input, onProcess);

    // 验证 session 被传递
    expect(mockContainerStdin.write).toHaveBeenCalledWith(
      expect.stringContaining(sessionId)
    );
  });
});
```

### 3. 流式输出测试 (Unit + Integration)

```typescript
// src/streaming/__tests__/streaming-flow.test.ts
describe('Streaming Output Flow', () => {
  describe('Parser Integration', () => {
    it('should parse complete event stream from container', () => {
      const parser = new StreamParser();

      // 模拟容器输出
      const chunks = [
        '<<<THINKING>>>\n{"type":"thinking","timestamp":"2024-01-01T00:00:00Z","data":{"content":"A',
        'nalyzing code structure..."}}\n<<<THINKING_END>>>',
        '\n<<<TOOL:grep>>>{"type":"tool_start","timestamp":"2024-01-01T00:00:01Z","data":{"toolId":"t1","name":"grep","input":{"pattern":"TODO"}}}',
        '\n<<<TOOL_COMPLETE>>>{"type":"tool_complete","timestamp":"2024-01-01T00:00:02Z","data":{"toolId":"t1","name":"grep","duration":100,"result":["TODO: Fix bug"]}}',
      ];

      const allEvents: StreamEvent[] = [];
      for (const chunk of chunks) {
        allEvents.push(...parser.parseChunk(chunk));
      }

      expect(allEvents).toHaveLength(3);
      expect(allEvents[0]).toMatchObject({ type: 'thinking' });
      expect(allEvents[1]).toMatchObject({ type: 'tool_start' });
      expect(allEvents[2]).toMatchObject({ type: 'tool_complete' });
    });
  });

  describe('Processor State Management', () => {
    it('should maintain correct execution state', () => {
      const processor = new StreamProcessor({
        sessionId: 'test',
        groupName: 'test-group',
      });

      // 模拟完整执行流程
      processor.processChunk(createEventChunk('plan', {
        steps: [
          { id: '1', description: 'Analyze code', status: 'pending' },
          { id: '2', description: 'Find bugs', status: 'pending' },
        ]
      }));

      // 步骤1进行中
      processor.processChunk(createEventChunk('plan_step', {
        stepId: '1', status: 'in_progress'
      }));

      // 工具调用
      processor.processChunk(createEventChunk('tool_start', {
        toolId: 't1', name: 'grep', input: { pattern: 'TODO' }
      }));

      // 工具完成
      processor.processChunk(createEventChunk('tool_complete', {
        toolId: 't1', name: 'grep', duration: 100, result: []
      }));

      // 步骤1完成
      processor.processChunk(createEventChunk('plan_step', {
        stepId: '1', status: 'completed'
      }));

      const status = processor.getCurrentStatus();
      expect(status.currentStep?.id).toBe('1');
      expect(status.currentStep?.status).toBe('completed');
      expect(status.progress).toBe(50); // 1/2 steps
    });
  });
});
```

## 测试工具函数

```typescript
// src/__tests__/helpers/test-utils.ts

/**
 * 创建测试消息
 */
export function createTestMessage(overrides: Partial<NewMessage> = {}): NewMessage {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    chat_jid: 'test-chat@example.com',
    sender: 'test-user',
    sender_name: 'Test User',
    content: 'Test message',
    timestamp: new Date().toISOString(),
    is_from_me: false,
    ...overrides,
  };
}

/**
 * 创建测试群组
 */
export function createTestGroup(overrides: Partial<RegisteredGroup> = {}): RegisteredGroup {
  return {
    name: 'test-group',
    folder: 'test-group',
    trigger: '@Test',
    added_at: new Date().toISOString(),
    isMain: false,
    requiresTrigger: true,
    ...overrides,
  };
}

/**
 * 创建流式事件 chunk
 */
export function createEventChunk(type: string, data: unknown): string {
  const event = {
    type,
    timestamp: new Date().toISOString(),
    data,
  };

  const markers: Record<string, string> = {
    thinking: 'THINKING',
    plan: 'PLAN',
    plan_step: 'STEP:',
    tool_start: 'TOOL:',
    tool_complete: 'TOOL_COMPLETE>>>',
    complete: 'COMPLETE>>>',
    error: 'ERROR>>>',
  };

  const marker = markers[type] || type.toUpperCase();
  return `<<<${marker}>>>${JSON.stringify(event)}`;
}

/**
 * 等待条件满足
 */
export async function waitFor(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * 创建长对话用于压缩测试
 */
export async function createLongMessage(count: number): Promise<NewMessage[]> {
  return Array.from({ length: count }, (_, i) => createTestMessage({
    id: `msg-${i}`,
    content: `Message ${i}: ${'x'.repeat(100)}`,
    timestamp: new Date(Date.now() + i * 1000).toISOString(),
    is_from_me: i % 2 === 1,
  }));
}

/**
 * Mock 容器进程
 */
export function createMockContainer() {
  const proc = new EventEmitter() as ChildProcess & {
    stdin: { write: jest.Mock; end: jest.Mock };
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };

  proc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.pid = 12345;

  return proc;
}
```

## Mock 策略

### 1. 外部依赖 Mock

```typescript
// src/__tests__/mocks/external.ts

// Mock Docker/容器运行时
vi.mock('../container-runtime.js', () => ({
  ensureContainerRuntimeRunning: vi.fn().mockResolvedValue(undefined),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  PROXY_BIND_HOST: '127.0.0.1',
}));

// Mock 数据库
vi.mock('../db.js', () => ({
  initDatabase: vi.fn().mockResolvedValue(undefined),
  storeMessage: vi.fn().mockResolvedValue(undefined),
  getMessagesSince: vi.fn().mockResolvedValue([]),
  setSession: vi.fn().mockResolvedValue(undefined),
  getAllSessions: vi.fn().mockResolvedValue([]),
}));

// Mock 日志
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
```

### 2. 通道 Mock

```typescript
// src/__tests__/mocks/channel.ts

export class MockChannel implements Channel {
  name = 'mock';
  private connected = false;
  private messageHandler?: (chatJid: string, message: NewMessage) => void;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('mock:');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    // 记录发送的消息
    mockSentMessages.push({ jid, text, timestamp: Date.now() });
  }

  onMessage(handler: (chatJid: string, message: NewMessage) => void): void {
    this.messageHandler = handler;
  }

  // 测试辅助方法
  simulateIncomingMessage(message: NewMessage): void {
    this.messageHandler?.(message.chat_jid, message);
  }
}
```

## 测试配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/__tests__/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4,
      },
    },
  },
});
```

## 运行测试

```bash
# 运行所有测试
npm test

# 运行特定模块
npm test -- src/streaming
npm test -- src/compact

# 运行 E2E 测试
npm test -- e2e/

# 带覆盖率报告
npm run test:coverage

# 开发模式（watch）
npm run test:watch

# 调试特定测试
npm test -- --reporter=verbose --testNamePattern="should process message"
```

## 持续集成

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Run Tests
        run: npm test -- --run

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## 测试最佳实践

1. **每个测试独立** - 使用 `beforeEach` 清理状态
2. **测试单一行为** - 一个 `it` 只测试一个功能点
3. **使用描述性名称** - 清楚说明测试什么和期望结果
4. **Mock 外部依赖** - 数据库、网络、文件系统