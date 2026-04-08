import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const schedulerMocks = vi.hoisted(() => ({
  runContainerAgent: vi.fn(),
  writeTasksSnapshot: vi.fn(),
}));

vi.mock('./config.js', async () => {
  const actual =
    await vi.importActual<typeof import('./config.js')>('./config.js');
  return {
    ...actual,
    ASSISTANT_NAME: 'Andy',
    SCHEDULER_POLL_INTERVAL: 50,
    TASK_MAX_RETRIES: 2,
    TASK_RETRY_BASE_MS: 10,
    TIMEZONE: 'UTC',
  };
});

vi.mock('./container-runner.js', () => ({
  runContainerAgent: schedulerMocks.runContainerAgent,
  writeTasksSnapshot: schedulerMocks.writeTasksSnapshot,
}));

import { _initTestDatabase, createTask, getTaskById } from './db.js';
import {
  _resetSchedulerLoopForTests,
  computeNextRun,
  startSchedulerLoop,
} from './task-scheduler.js';
import { isTransientProviderError } from './transient-retry.js';

describe('task scheduler', () => {
  beforeEach(() => {
    _initTestDatabase();
    _resetSchedulerLoopForTests();
    vi.useFakeTimers();
    schedulerMocks.runContainerAgent.mockReset();
    schedulerMocks.writeTasksSnapshot.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses due tasks with invalid group folders to prevent retry churn', async () => {
    createTask({
      id: 'task-invalid-folder',
      group_folder: '../../outside',
      chat_jid: 'bad@g.us',
      prompt: 'run',
      schedule_type: 'once',
      schedule_value: '2026-02-22T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-02-22T00:00:00.000Z',
    });

    const enqueueTask = vi.fn(
      (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
        void fn();
      },
    );

    startSchedulerLoop({
      registeredGroups: () => ({}),
      getSessions: () => ({}),
      upsertSession: () => {},
      queue: { enqueueTask } as any,
      onProcess: () => {},
      sendMessage: async () => {},
    });

    await vi.advanceTimersByTimeAsync(10);

    const task = getTaskById('task-invalid-folder');
    expect(task?.status).toBe('paused');
  });

  it('computeNextRun anchors interval tasks to scheduled time to prevent drift', () => {
    const scheduledTime = new Date(Date.now() - 2000).toISOString(); // 2s ago
    const task = {
      id: 'drift-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'interval' as const,
      schedule_value: '60000', // 1 minute
      context_mode: 'isolated' as const,
      next_run: scheduledTime,
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();

    // Should be anchored to scheduledTime + 60s, NOT Date.now() + 60s
    const expected = new Date(scheduledTime).getTime() + 60000;
    expect(new Date(nextRun!).getTime()).toBe(expected);
  });

  it('computeNextRun returns null for once-tasks', () => {
    const task = {
      id: 'once-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'once' as const,
      schedule_value: '2026-01-01T00:00:00.000Z',
      context_mode: 'isolated' as const,
      next_run: new Date(Date.now() - 1000).toISOString(),
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    expect(computeNextRun(task)).toBeNull();
  });

  it('computeNextRun skips missed intervals without infinite loop', () => {
    // Task was due 10 intervals ago (missed)
    const ms = 60000;
    const missedBy = ms * 10;
    const scheduledTime = new Date(Date.now() - missedBy).toISOString();

    const task = {
      id: 'skip-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'interval' as const,
      schedule_value: String(ms),
      context_mode: 'isolated' as const,
      next_run: scheduledTime,
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();
    // Must be in the future
    expect(new Date(nextRun!).getTime()).toBeGreaterThan(Date.now());
    // Must be aligned to the original schedule grid
    const offset =
      (new Date(nextRun!).getTime() - new Date(scheduledTime).getTime()) % ms;
    expect(offset).toBe(0);
  });

  it('computeNextRun falls back safely when interval task has no valid next_run', () => {
    const before = Date.now();
    const task = {
      id: 'missing-anchor',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'interval' as const,
      schedule_value: '60000',
      context_mode: 'isolated' as const,
      next_run: null,
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();
    expect(new Date(nextRun!).getTime()).toBeGreaterThanOrEqual(before + 60000);
  });

  it('classifies transient provider errors for scheduled task retry', () => {
    expect(
      isTransientProviderError(
        '502 {"error":{"message":"Upstream service temporarily unavailable"}}',
      ),
    ).toBe(true);
    expect(isTransientProviderError('429 rate limit exceeded')).toBe(true);
    expect(isTransientProviderError('Request timed out')).toBe(true);
    expect(isTransientProviderError('Invalid cron expression')).toBe(false);
  });

  it('retries scheduled tasks on transient provider errors', async () => {
    createTask({
      id: 'task-retry-transient',
      group_folder: 'test-group',
      chat_jid: 'test@g.us',
      prompt: 'run retry task',
      schedule_type: 'once',
      schedule_value: '2026-02-22T00:00:00.000Z',
      context_mode: 'group',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-02-22T00:00:00.000Z',
    });

    const sendMessage = vi.fn(async () => {});
    schedulerMocks.runContainerAgent
      .mockResolvedValueOnce({
        status: 'error',
        result: null,
        error: '429 rate limit exceeded',
      })
      .mockImplementationOnce(
        async (
          _group: unknown,
          _input: unknown,
          _onProcess: unknown,
          onOutput?: (output: any) => Promise<void>,
        ) => {
          await onOutput?.({
            status: 'success',
            result: 'done',
            newSessionId: 'session-1',
            lastAssistantUuid: 'checkpoint-1',
          });
          return {
            status: 'success',
            result: null,
            newSessionId: 'session-1',
            lastAssistantUuid: 'checkpoint-1',
            queryCompleted: true,
          };
        },
      );

    startSchedulerLoop({
      registeredGroups: () => ({
        'test@g.us': {
          jid: 'test@g.us',
          name: 'Test Group',
          folder: 'test-group',
          trigger: '@Andy',
          added_at: new Date().toISOString(),
        },
      }),
      getSessions: () => ({}),
      upsertSession: () => {},
      queue: {
        enqueueTask: vi.fn(
          (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
            void fn();
          },
        ),
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage,
    });

    await vi.advanceTimersByTimeAsync(40);

    expect(schedulerMocks.runContainerAgent).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('test@g.us', 'done');
  });

  it('does not retry scheduled tasks on deterministic errors', async () => {
    createTask({
      id: 'task-no-retry',
      group_folder: 'test-group',
      chat_jid: 'test@g.us',
      prompt: 'run no retry task',
      schedule_type: 'once',
      schedule_value: '2026-02-22T00:00:00.000Z',
      context_mode: 'group',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-02-22T00:00:00.000Z',
    });

    schedulerMocks.runContainerAgent.mockResolvedValueOnce({
      status: 'error',
      result: null,
      error: 'Invalid cron expression',
    });

    startSchedulerLoop({
      registeredGroups: () => ({
        'test@g.us': {
          jid: 'test@g.us',
          name: 'Test Group',
          folder: 'test-group',
          trigger: '@Andy',
          added_at: new Date().toISOString(),
        },
      }),
      getSessions: () => ({}),
      upsertSession: () => {},
      queue: {
        enqueueTask: vi.fn(
          (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
            void fn();
          },
        ),
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage: async () => {},
    });

    await vi.advanceTimersByTimeAsync(20);

    expect(schedulerMocks.runContainerAgent).toHaveBeenCalledTimes(1);
  });

  it('reuses refreshed session state on scheduled-task retry', async () => {
    createTask({
      id: 'task-session-refresh',
      group_folder: 'test-group',
      chat_jid: 'test@g.us',
      prompt: 'resume long task',
      schedule_type: 'once',
      schedule_value: '2026-02-22T00:00:00.000Z',
      context_mode: 'group',
      next_run: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      created_at: '2026-02-22T00:00:00.000Z',
    });

    const sessionStore: Record<
      string,
      { sessionId: string; resumeAt: string | null }
    > = {
      'test-group': {
        sessionId: 'session-initial',
        resumeAt: 'checkpoint-initial',
      },
    };

    schedulerMocks.runContainerAgent
      .mockImplementationOnce(
        async (
          _group: unknown,
          input: { sessionId?: string; resumeAt?: string },
          _onProcess: unknown,
          onOutput?: (output: any) => Promise<void>,
        ) => {
          expect(input.sessionId).toBe('session-initial');
          expect(input.resumeAt).toBe('checkpoint-initial');
          await onOutput?.({
            status: 'success',
            result: null,
            newSessionId: 'session-updated',
            lastAssistantUuid: 'checkpoint-updated',
          });
          return {
            status: 'error',
            result: null,
            error: '502 upstream service temporarily unavailable',
            newSessionId: 'session-updated',
            lastAssistantUuid: 'checkpoint-updated',
          };
        },
      )
      .mockImplementationOnce(
        async (
          _group: unknown,
          input: { sessionId?: string; resumeAt?: string },
        ) => {
          expect(input.sessionId).toBe('session-updated');
          expect(input.resumeAt).toBe('checkpoint-updated');
          return {
            status: 'success',
            result: null,
            newSessionId: 'session-updated',
            lastAssistantUuid: 'checkpoint-updated',
            queryCompleted: true,
          };
        },
      );

    startSchedulerLoop({
      registeredGroups: () => ({
        'test@g.us': {
          jid: 'test@g.us',
          name: 'Test Group',
          folder: 'test-group',
          trigger: '@Andy',
          added_at: new Date().toISOString(),
        },
      }),
      getSessions: () => sessionStore,
      upsertSession: (groupFolder, session) => {
        sessionStore[groupFolder] = {
          sessionId: session.sessionId,
          resumeAt: session.resumeAt ?? null,
        };
      },
      queue: {
        enqueueTask: vi.fn(
          (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
            void fn();
          },
        ),
        closeStdin: vi.fn(),
        notifyIdle: vi.fn(),
      } as any,
      onProcess: () => {},
      sendMessage: async () => {},
    });

    await vi.advanceTimersByTimeAsync(40);

    expect(schedulerMocks.runContainerAgent).toHaveBeenCalledTimes(2);
    expect(sessionStore['test-group']).toEqual({
      sessionId: 'session-updated',
      resumeAt: 'checkpoint-updated',
    });
  });
});
