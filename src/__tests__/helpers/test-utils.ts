/**
 * Test Utilities for NanoHarness
 *
 * This module provides helper functions and mock factories for testing.
 */

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import type { NewMessage, RegisteredGroup } from '../../types.js';
import type { ContainerInput } from '../../container-runner.js';

/**
 * Create a test message with optional overrides
 */
export function createTestMessage(
  overrides: Partial<NewMessage> = {},
): NewMessage {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chat_jid: 'test-chat@example.com',
    sender: 'test-user',
    sender_name: 'Test User',
    content: 'Test message content',
    timestamp: new Date().toISOString(),
    is_from_me: false,
    ...overrides,
  };
}

/**
 * Create a test group with optional overrides
 */
export function createTestGroup(
  overrides: Partial<RegisteredGroup> = {},
): RegisteredGroup {
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
 * Create a container input with optional overrides
 */
export function createContainerInput(
  overrides: Partial<ContainerInput> = {},
): ContainerInput {
  return {
    prompt: 'Test prompt',
    groupFolder: 'test-group',
    chatJid: 'test@example.com',
    isMain: false,
    enableStreaming: true,
    ...overrides,
  };
}

/**
 * Create a streaming event chunk for testing
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
    tool_progress: 'PROGRESS:',
    tool_complete: 'TOOL_COMPLETE>>>',
    decision: 'DECISION>>>',
    complete: 'COMPLETE>>>',
    error: 'ERROR>>>',
  };

  const marker = markers[type] || type.toUpperCase();

  // Block-based events need end markers
  if (['thinking', 'plan', 'content'].includes(type)) {
    return `<<<${marker}>>>
${JSON.stringify(event)}
<<<${marker}_END>>>`;
  }

  return `<<<${marker}>>>${JSON.stringify(event)}`;
}

/**
 * Create multiple messages for context compression tests
 */
export function createLongMessages(count: number): NewMessage[] {
  return Array.from({ length: count }, (_, i) =>
    createTestMessage({
      id: `msg-${i}`,
      content: `Message ${i}: ${'x'.repeat(200)}`,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      is_from_me: i % 2 === 1,
    }),
  );
}

/**
 * Wait for a condition to be met
 */
export async function waitFor(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Create a mock child process for container testing
 */
export function createMockChildProcess(): ChildProcess & {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
} {
  const proc = new EventEmitter() as ChildProcess & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };

  (
    proc as unknown as {
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
    }
  ).stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  (
    proc as unknown as {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
    }
  ).stdout = new EventEmitter();
  (
    proc as unknown as {
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
    }
  ).stderr = new EventEmitter();
  (
    proc as unknown as {
      kill: ReturnType<typeof vi.fn>;
      pid: number;
    }
  ).kill = vi.fn();
  (proc as { pid: number }).pid = 12345;

  return proc;
}

/**
 * Simulate container output events
 */
export function simulateContainerOutput(
  stdout: EventEmitter,
  events: Array<{ type: string; data: unknown }>,
): void {
  for (const event of events) {
    stdout.emit('data', Buffer.from(createEventChunk(event.type, event.data)));
  }
}

/**
 * Mock console methods for testing
 */
export function mockConsole(): {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  restore: () => void;
} {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const log = vi.fn();
  const error = vi.fn();
  const warn = vi.fn();

  console.log = log;
  console.error = error;
  console.warn = warn;

  return {
    log,
    error,
    warn,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

/**
 * Assert that a message contains a trigger pattern
 */
export function expectContainsTrigger(
  message: NewMessage,
  trigger: string,
): void {
  expect(message.content).toContain(trigger);
}

/**
 * Assert that a message was sent from a specific sender
 */
export function expectFromSender(
  message: NewMessage,
  senderName: string,
): void {
  expect(message.sender_name).toBe(senderName);
}

/**
 * Create a delayed promise for async testing
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an assertion multiple times
 */
export async function retry<T>(
  fn: () => T,
  options: { maxAttempts?: number; delay?: number } = {},
): Promise<T> {
  const { maxAttempts = 3, delay: delayMs = 100 } = options;
  let lastError: Error | undefined;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxAttempts - 1) {
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}
