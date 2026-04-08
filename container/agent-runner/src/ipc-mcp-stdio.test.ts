import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tools: new Map<string, (...args: any[]) => Promise<any>>(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  existsSync: vi.fn((target: string) => target === '/workspace/ipc/current_tasks.json'),
  readFileSync: vi.fn(() => JSON.stringify([
    {
      id: 'task-1',
      groupFolder: 'local-group',
      prompt: 'daily summary',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      status: 'active',
      next_run: 'tomorrow',
    },
  ])),
  connect: vi.fn(async () => {}),
}));

process.env.NANOCLAW_CHAT_JID = 'local:test';
process.env.NANOCLAW_GROUP_FOLDER = 'local-group';
process.env.NANOCLAW_IS_MAIN = '0';

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class MockMcpServer {
    tool(name: string, _description: string, _schema: unknown, handler: (...args: any[]) => Promise<any>) {
      state.tools.set(name, handler);
    }
    connect = state.connect;
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class MockTransport {},
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      writeFileSync: state.writeFileSync,
      mkdirSync: state.mkdirSync,
      renameSync: state.renameSync,
      existsSync: state.existsSync,
      readFileSync: state.readFileSync,
    },
  };
});

describe('ipc mcp stdio tools', () => {
  beforeEach(async () => {
    vi.resetModules();
    state.tools.clear();
    vi.clearAllMocks();
    await import('./ipc-mcp-stdio.ts');
  });

  it('registers core tools and exercises send_message path', async () => {
    expect(state.tools.has('send_message')).toBe(true);
    expect(state.tools.has('schedule_task')).toBe(true);
    expect(state.tools.has('list_tasks')).toBe(true);
    expect(state.tools.has('register_group')).toBe(true);

    const sendMessage = state.tools.get('send_message');
    const result = await sendMessage!({ text: 'hello', sender: 'Researcher' });

    expect(result.content[0].text).toBe('Message sent.');
    expect(state.writeFileSync).toHaveBeenCalled();
    expect(state.renameSync).toHaveBeenCalled();
  });

  it('does not force cron validation when update_task only changes schedule_value', async () => {
    const updateTask = state.tools.get('update_task');
    const result = await updateTask!({
      task_id: 'task-1',
      schedule_value: '60000',
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('update requested');
    expect(state.writeFileSync).toHaveBeenCalled();
  });

  it('still validates cron expressions when update_task explicitly sets cron', async () => {
    const updateTask = state.tools.get('update_task');
    const result = await updateTask!({
      task_id: 'task-1',
      schedule_type: 'cron',
      schedule_value: 'not-a-cron',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid cron');
  });
});
