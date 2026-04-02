# NanoHarness Testing

This directory contains the test suite for NanoHarness, organized into unit, integration, and E2E tests.

## Directory Structure

```
src/__tests__/
├── README.md              # This file
├── setup.ts               # Test setup (runs before all tests)
├── helpers/               # Test utilities and factories
│   └── test-utils.ts      # Helper functions for creating test data
├── unit/                  # Unit tests
│   ├── router.test.ts
│   └── formatter.test.ts
├── integration/           # Integration tests
│   ├── streaming.test.ts
│   └── container.test.ts
└── e2e/                   # End-to-end tests
    └── message-lifecycle.test.ts
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/__tests__/e2e/message-lifecycle.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode (development)
npm run test:watch

# Run with verbose output
npm test -- --reporter=verbose

# Run only tests matching a pattern
npm test -- --testNamePattern="should process message"
```

## Writing Tests

### Unit Tests

Test individual functions in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { formatMessages } from '../../router.js';

describe('formatMessages', () => {
  it('should format messages correctly', () => {
    const messages = [createTestMessage({ content: 'Hello' })];
    const result = formatMessages(messages, 'UTC');

    expect(result).toContain('<messages>');
    expect(result).toContain('Hello');
  });
});
```

### Integration Tests

Test interaction between modules:

```typescript
import { describe, it, expect } from 'vitest';
import { StreamProcessor } from '../../streaming/processor.js';
import { createEventChunk } from '../helpers/test-utils.js';

describe('Streaming Integration', () => {
  it('should process and store events', () => {
    const processor = new StreamProcessor({ sessionId: 'test', groupName: 'test' });

    processor.processChunk(createEventChunk('thinking', { content: 'Test' }));

    expect(processor.getEvents()).toHaveLength(1);
  });
});
```

### E2E Tests

Test complete user workflows:

```typescript
import { describe, it, expect } from 'vitest';
import { createTestMessage, waitFor } from '../helpers/test-utils.js';

describe('Message Lifecycle', () => {
  it('should process message from receive to response', async () => {
    const message = createTestMessage({ content: '@Andy hello' });

    // Simulate message processing
    await simulateMessageProcessing(message);

    // Assert on the outcome
    await waitFor(() => mockSendMessage.called);
    expect(mockSendMessage).toHaveBeenCalled();
  });
});
```

## Test Utilities

### Creating Test Data

```typescript
import {
  createTestMessage,
  createTestGroup,
  createContainerInput,
  createEventChunk,
} from './helpers/test-utils.js';

// Create a test message
const message = createTestMessage({
  content: 'Test content',
  chat_jid: 'test@example.com',
});

// Create a test group
const group = createTestGroup({
  name: 'my-group',
  trigger: '@Bot',
});

// Create a container input
const input = createContainerInput({
  prompt: 'Test prompt',
  enableStreaming: true,
});

// Create a streaming event chunk
const chunk = createEventChunk('thinking', { content: 'Analyzing...' });
```

### Waiting for Async Operations

```typescript
import { waitFor, delay } from './helpers/test-utils.js';

// Wait for a condition
await waitFor(() => mockSendMessage.called, { timeout: 10000 });

// Wait for a specific time
await delay(500);
```

### Mocking

```typescript
import { vi } from 'vitest';

// Mock a module
vi.mock('../../db.js', () => ({
  storeMessage: vi.fn().mockResolvedValue(undefined),
  getMessagesSince: vi.fn().mockResolvedValue([]),
}));

// Mock a function
const mockRunContainer = vi.fn().mockResolvedValue({ status: 'success' });

// Spy on a function
const spy = vi.spyOn(console, 'log');
```

## Best Practices

1. **Test Independence**: Each test should be independent. Use `beforeEach` to reset state.

2. **Clear Naming**: Use descriptive test names that explain what is being tested and the expected outcome.
   ```typescript
   it('should trigger agent when message contains trigger pattern')
   it('should not trigger agent when message lacks trigger')
   ```

3. **Mock External Dependencies**: Database, network, and file system operations should be mocked.

4. **Test Edge Cases**: Test error conditions, timeouts, and boundary cases.

5. **Keep Tests Fast**: Avoid real delays; use mocked timers where possible.

6. **Use Test Utilities**: Leverage the helper functions in `test-utils.ts` for consistency.

## Coverage

Current coverage thresholds:
- Lines: 80%
- Functions: 80%
- Branches: 70%
- Statements: 80%

View coverage report:
```bash
npm run test:coverage
open coverage/index.html
```

## Adding New Tests

When adding a new feature:

1. Write unit tests for new functions
2. Write integration tests for module interactions
3. Write E2E tests for user-facing workflows
4. Run all tests to ensure no regressions
5. Check coverage meets thresholds

## Debugging Tests

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/vitest --run

# Run specific test with verbose output
npm test -- --reporter=verbose src/__tests__/e2e/message-lifecycle.test.ts

# Run with logging enabled
DEBUG=true npm test
```
