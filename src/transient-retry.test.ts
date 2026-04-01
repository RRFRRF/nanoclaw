import { describe, expect, it } from 'vitest';

import {
  isTransientProviderError,
  shouldRetryTransientAttempt,
} from './transient-retry.js';

describe('transient retry policy', () => {
  it('classifies common provider transient failures', () => {
    expect(isTransientProviderError('429 rate limit exceeded')).toBe(true);
    expect(
      isTransientProviderError('502 {"error":{"message":"暂不可用"}}'),
    ).toBe(true);
    expect(isTransientProviderError('socket hang up')).toBe(true);
    expect(isTransientProviderError('invalid cron expression')).toBe(false);
  });

  it('retries only when no visible result or completion was observed', () => {
    expect(
      shouldRetryTransientAttempt({
        attempt: 1,
        maxAttempts: 3,
        error: '502 bad gateway',
      }),
    ).toBe(true);

    expect(
      shouldRetryTransientAttempt({
        attempt: 3,
        maxAttempts: 3,
        error: '502 bad gateway',
      }),
    ).toBe(false);

    expect(
      shouldRetryTransientAttempt({
        attempt: 1,
        maxAttempts: 3,
        error: '502 bad gateway',
        sentVisibleResult: true,
      }),
    ).toBe(false);

    expect(
      shouldRetryTransientAttempt({
        attempt: 1,
        maxAttempts: 3,
        error: '502 bad gateway',
        observedCompletion: true,
      }),
    ).toBe(false);
  });
});
