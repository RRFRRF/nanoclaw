import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsState = vi.hoisted(() => {
  const exists = new Set<string>([
    '/workspace/group',
    '/workspace/ipc',
    '/workspace/project',
    '/workspace/extra',
    '/workspace/group/CLAUDE.md',
    '/workspace/project/CLAUDE.md',
  ]);

  return {
    existsSync: vi.fn((target: string) => exists.has(target)),
    readFileSync: vi.fn((target: string) => {
      if (target === '/workspace/group/CLAUDE.md') {
        return 'group memory';
      }
      if (target === '/workspace/project/CLAUDE.md') {
        return 'project memory';
      }
      return '';
    }),
    readdirSync: vi.fn((target: string) => {
      if (target === '/workspace/group') {
        return ['CLAUDE.md', 'outputs'];
      }
      if (target === '/workspace/ipc') {
        return ['input', 'messages', 'tasks'];
      }
      if (target === '/workspace/project') {
        return ['README.md', 'src'];
      }
      if (target === '/workspace/extra') {
        return ['mounted-repo'];
      }
      return [];
    }),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
    cpSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
    statSync: vi.fn(() => ({
      isDirectory: () => true,
    })),
  };
});

const mcpState = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  listTools: vi.fn(async () => ({ tools: [] })),
  callTool: vi.fn(async () => ({ content: [] })),
  close: vi.fn(async () => {}),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      ...fsState,
    },
  };
});

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class ChatAnthropic {},
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class ChatOpenAI {},
}));

vi.mock('@langchain/core/tools', () => ({
  tool: vi.fn(),
}));

vi.mock('@langchain/langgraph-checkpoint-sqlite', () => ({
  SqliteSaver: {
    fromConnString: vi.fn(),
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mcpState.connect;
    listTools = mcpState.listTools;
    callTool = mcpState.callTool;
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockTransport {
    stderr = { on: vi.fn() };
    close = mcpState.close;
  },
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolResultSchema: {},
  CompatibilityCallToolResultSchema: {},
}));

vi.mock('deepagents', () => ({
  createDeepAgent: vi.fn(),
  LocalShellBackend: {
    create: vi.fn(),
  },
}));

describe('agent runner runtime diagnostics', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function loadRuntimeModule() {
    const modPath = '../container/agent-runner/src/index.ts';
    return (await import(modPath)) as {
      buildRuntimePromptBundle: (
        basePrompt: string,
        containerInput: {
          prompt: string;
          groupFolder: string;
          chatJid: string;
          isMain: boolean;
          isScheduledTask?: boolean;
        },
        options?: {
          sessionId?: string;
          resumeAt?: string;
          pendingIpcMessages?: string[];
        },
      ) => {
        runtimePrompt: string;
        snapshot: {
          pendingIpcMessages: string[];
          workspaceManifestPath: string;
        };
      };
      buildWorkspaceManifest: (containerInput: {
        prompt: string;
        groupFolder: string;
        chatJid: string;
        isMain: boolean;
      }) => {
        writableRoot: string;
        requiredOutputRoot: string;
        rules: string[];
        mounts: Array<{
          path: string;
          mode: string;
          entries?: string[];
        }>;
      };
      getAutoContinueConfig: (env?: NodeJS.ProcessEnv) => {
        limit: number;
        allowScheduledTasks: boolean;
      };
      getAutoContinueReason: (
        queryResult: {
          closedDuringQuery: boolean;
          lastAssistantText: string;
          lastResultText: string | null;
          lastResultSubtype?: string;
          sawStatusEvent: boolean;
        },
        isScheduledTask: boolean,
        autoContinueCount: number,
        config?: {
          limit: number;
          allowScheduledTasks: boolean;
        },
      ) => string | null;
      parseConfiguredMcpServers: (raw?: string) => Array<{
        name: string;
        command: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
      }>;
    };
  }

  it('builds a runtime prompt bundle with injected memories and diagnostics', async () => {
    const mod = await loadRuntimeModule();

    const bundle = mod.buildRuntimePromptBundle(
      '<context timezone="Asia/Shanghai" />\n<messages>\n<message sender="user" time="2026-04-01 10:00">test</message>\n</messages>',
      {
        prompt: 'ignored',
        groupFolder: 'local-test',
        chatJid: 'local:test',
        isMain: true,
      },
      {
        sessionId: 'session-1',
        resumeAt: 'checkpoint-1',
        pendingIpcMessages: ['follow-up message'],
      },
    );

    expect(bundle.runtimePrompt).toContain(
      'Write all new files, screenshots, reports, logs, and generated outputs under /workspace/group.',
    );
    expect(bundle.runtimePrompt).toContain('<group_memory>');
    expect(bundle.runtimePrompt).toContain('group memory');
    expect(bundle.runtimePrompt).toContain('<project_memory>');
    expect(bundle.runtimePrompt).toContain('project memory');
    expect(bundle.snapshot.pendingIpcMessages).toEqual(['follow-up message']);
    expect(bundle.snapshot.workspaceManifestPath).toBe(
      '/workspace/group/.nanoclaw/workspace-manifest.json',
    );
  });

  it('builds a workspace manifest centered on the group workspace', async () => {
    const mod = await loadRuntimeModule();

    const manifest = mod.buildWorkspaceManifest({
      prompt: 'ignored',
      groupFolder: 'local-test',
      chatJid: 'local:test',
      isMain: true,
    });

    expect(manifest.writableRoot).toBe('/workspace/group');
    expect(manifest.requiredOutputRoot).toBe('/workspace/group/outputs');
    expect(manifest.rules).toContain(
      'Write all new artifacts under /workspace/group.',
    );
    expect(manifest.mounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/workspace/group',
          mode: 'rw',
          entries: ['CLAUDE.md', 'outputs'],
        }),
        expect.objectContaining({
          path: '/workspace/extra',
          mode: 'host-configured',
          entries: ['mounted-repo'],
        }),
      ]),
    );
  });

  it('reads auto-continue config from env and can include scheduled tasks', async () => {
    const mod = await loadRuntimeModule();

    const config = mod.getAutoContinueConfig({
      NANOCLAW_AUTO_CONTINUE_LIMIT: '9',
      NANOCLAW_AUTO_CONTINUE_SCHEDULED: 'true',
    } as NodeJS.ProcessEnv);

    expect(config).toEqual({
      limit: 9,
      allowScheduledTasks: true,
    });

    const reason = mod.getAutoContinueReason(
      {
        closedDuringQuery: false,
        lastAssistantText: 'I will start by checking the repository.',
        lastResultText: null,
        lastResultSubtype: 'success',
        sawStatusEvent: false,
      },
      true,
      0,
      config,
    );

    expect(reason).toBe('planning output emitted without a final result');
  });

  it('parses configured MCP stdio servers from env JSON', async () => {
    const mod = await loadRuntimeModule();

    const servers = mod.parseConfiguredMcpServers(
      JSON.stringify([
        {
          name: 'playwright',
          command: 'node',
          args: ['./mcp/playwright.js'],
          cwd: '/workspace/group',
          env: {
            FOO: 'bar',
          },
        },
      ]),
    );

    expect(servers).toEqual([
      {
        name: 'playwright',
        command: 'node',
        args: ['./mcp/playwright.js'],
        cwd: '/workspace/group',
        env: {
          FOO: 'bar',
        },
      },
    ]);
  });
});
