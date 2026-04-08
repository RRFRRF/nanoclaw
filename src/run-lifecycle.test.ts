import { describe, expect, it } from 'vitest';

import {
  createNormalizedRunState,
  markNormalizedOutput,
  markNormalizedStreamEvent,
} from './run-lifecycle.js';

describe('run lifecycle normalization', () => {
  it('does not mark stream completion after an error event', () => {
    const state = createNormalizedRunState();

    markNormalizedStreamEvent(state, { type: 'error' });
    markNormalizedStreamEvent(state, { type: 'complete' });

    expect(state.observedStreamError).toBe(true);
    expect(state.observedStreamCompletion).toBe(false);
    expect(state.hadStreamingActivity).toBe(true);
  });

  it('marks stream completion for a pure complete event', () => {
    const state = createNormalizedRunState();

    markNormalizedStreamEvent(state, { type: 'complete' });

    expect(state.observedStreamCompletion).toBe(true);
    expect(state.hadStreamingActivity).toBe(true);
  });

  it('does not mark stream completion after visible output already completed the turn', () => {
    const state = createNormalizedRunState();

    markNormalizedOutput(state, { result: 'hello' });
    markNormalizedStreamEvent(state, { type: 'complete' });

    expect(state.sentVisibleResult).toBe(true);
    expect(state.observedStreamCompletion).toBe(false);
  });
});
