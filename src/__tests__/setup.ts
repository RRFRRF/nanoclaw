/**
 * Test Setup
 *
 * This file runs before all tests. Use it to:
 * - Set up global mocks
 * - Configure test environment
 * - Clean up between test runs
 */

import { beforeAll, afterAll, vi } from 'vitest';
import path from 'path';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Reduce console noise during tests
  if (!process.env.DEBUG) {
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
  }
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global mocks
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Ensure clean state between test files
vi.mock('../db.js', async () => {
  const mockDb = {
    initDatabase: vi.fn().mockResolvedValue(undefined),
    storeMessage: vi.fn().mockResolvedValue(undefined),
    getMessagesSince: vi.fn().mockResolvedValue([]),
    getNewMessages: vi.fn().mockResolvedValue([]),
    setSession: vi.fn().mockResolvedValue(undefined),
    getAllSessions: vi.fn().mockResolvedValue([]),
    getSession: vi.fn().mockResolvedValue(null),
    storeChatMetadata: vi.fn().mockResolvedValue(undefined),
    getAllRegisteredGroups: vi.fn().mockResolvedValue([]),
    setRegisteredGroup: vi.fn().mockResolvedValue(undefined),
    getRouterState: vi.fn().mockResolvedValue({ lastTimestamp: '0' }),
    setRouterState: vi.fn().mockResolvedValue(undefined),
    getAllTasks: vi.fn().mockResolvedValue([]),
    getAllChats: vi.fn().mockResolvedValue([]),
  };
  return mockDb;
});

// Mock container runtime
vi.mock('../container-runtime.js', () => ({
  ensureContainerRuntimeRunning: vi.fn().mockResolvedValue(undefined),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  cleanupOrphans: vi.fn().mockResolvedValue(undefined),
  PROXY_BIND_HOST: '127.0.0.1',
}));

// Mock credential proxy
vi.mock('../credential-proxy.js', () => ({
  startCredentialProxy: vi.fn().mockResolvedValue({ port: 3001 }),
  stopCredentialProxy: vi.fn().mockResolvedValue(undefined),
  detectProvider: vi.fn().mockReturnValue('anthropic'),
  detectAuthMode: vi.fn().mockReturnValue('api-key'),
}));

// Mock config
vi.mock('../config.js', () => ({
  ASSISTANT_NAME: 'TestAssistant',
  CONTAINER_IMAGE: 'nanoharness-agent:test',
  CONTAINER_TIMEOUT: 300000,
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CREDENTIAL_PROXY_PORT: 3001,
  DATA_DIR: path.join(process.cwd(), 'test-data'),
  GROUPS_DIR: path.join(process.cwd(), 'test-groups'),
  IDLE_TIMEOUT: 300000,
  POLL_INTERVAL: 1000,
  TIMEZONE: 'UTC',
  TRIGGER_PATTERN: /@TestAssistant\b/i,
  ANTHROPIC_MODEL: 'claude-test',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-test',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-test',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-test',
  OPENAI_MODEL: 'gpt-test',
  CLAUDE_CODE_SUBAGENT_MODEL: 'gpt-test-mini',
  MODEL_API_FORMAT: 'anthropic',
  MODEL_PROVIDER: 'anthropic',
  AGENT_MAX_RETRIES: 2,
  AGENT_RETRY_BASE_MS: 1000,
  STREAMING_CONFIG: {
    ENABLED: true,
    SHOW_THINKING: true,
    SHOW_PLAN: true,
    SHOW_TOOLS: true,
    BUFFER_SIZE: 1000,
    MAX_EVENTS: 10000,
  },
}));

// Mock fs for test isolation
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue(''),
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    },
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    readdirSync: vi.fn().mockReturnValue([]),
    rmSync: vi.fn(),
    cpSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

// Mock path
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    default: actual,
  };
});
