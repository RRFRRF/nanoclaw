import { describe, expect, it } from 'vitest';

import { TerminalInkStore } from './terminal-ink.js';

describe('TerminalInkStore', () => {
  it('appends agent stream chunks without injecting extra newlines', () => {
    const store = new TerminalInkStore();

    store.addMessage({
      id: 'm1',
      label: 'agent:test',
      text: 'Hi',
      tone: 'agent',
      mergeKey: 'local:test',
      mergeMode: 'append',
    });
    store.addMessage({
      id: 'm2',
      label: 'agent:test',
      text: ' there',
      tone: 'agent',
      mergeKey: 'local:test',
      mergeMode: 'append',
    });
    store.addMessage({
      id: 'm3',
      label: 'agent:test',
      text: '!',
      tone: 'agent',
      mergeKey: 'local:test',
      mergeMode: 'append',
    });

    expect(store.getSnapshot().liveMessage?.text).toBe('Hi there!');
  });

  it('does not merge messages across different merge keys (turn isolation)', () => {
    const store = new TerminalInkStore();

    store.addMessage({
      id: 'm1',
      label: 'agent:test',
      text: 'Turn 1 response',
      tone: 'agent',
      mergeKey: 'local:test:t0',
      mergeMode: 'append',
    });

    // Flush the live message to simulate turn completion
    store.flushLiveMessage();

    store.addMessage({
      id: 'm2',
      label: 'agent:test',
      text: 'Turn 2 response',
      tone: 'agent',
      mergeKey: 'local:test:t1',
      mergeMode: 'append',
    });

    // Turn 2 should be in live, turn 1 should be in messages
    expect(store.getSnapshot().liveMessage?.text).toBe('Turn 2 response');
    expect(store.getSnapshot().messages).toHaveLength(1);
    expect(store.getSnapshot().messages[0].text).toBe('Turn 1 response');
  });
});
