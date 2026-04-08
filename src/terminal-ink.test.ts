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
});
