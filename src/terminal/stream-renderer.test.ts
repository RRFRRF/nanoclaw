import { describe, expect, it } from 'vitest';

import { mapStreamEventToRenderItems } from './stream-renderer.js';

describe('mapStreamEventToRenderItems', () => {
  it('maps native content chunks to mergeable append agent messages', () => {
    const items = mapStreamEventToRenderItems('local:test', 'agent:test', {
      type: 'content',
      timestamp: 't1',
      data: {
        text: 'hello',
        replace: false,
      },
    } as any);

    expect(items).toEqual([
      {
        kind: 'message',
        label: 'agent:test',
        text: 'hello',
        tone: 'agent',
        mergeKey: 'local:test',
        mergeMode: 'append',
      },
    ]);
  });

  it('maps replacing content events to replace mode', () => {
    const items = mapStreamEventToRenderItems('local:test', 'agent:test', {
      type: 'content',
      timestamp: 't1',
      data: {
        text: 'full response',
        replace: true,
      },
    } as any);

    expect(items[0]).toMatchObject({
      tone: 'agent',
      mergeKey: 'local:test',
      mergeMode: 'replace',
    });
  });
});
