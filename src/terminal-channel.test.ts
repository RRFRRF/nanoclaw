import { describe, expect, it } from 'vitest';

import {
  getTerminalCompletions,
  parseTerminalCommand,
} from './terminal-channel.js';

describe('parseTerminalCommand', () => {
  it('parses /new', () => {
    expect(parseTerminalCommand('/new analyst')).toEqual({
      type: 'new',
      name: 'analyst',
      mounts: [],
      readWrite: false,
    });
  });

  it('parses /new with mount and rw', () => {
    expect(
      parseTerminalCommand('/new analyst --mount "C:\\repo path" --rw'),
    ).toEqual({
      type: 'new',
      name: 'analyst',
      mounts: ['C:\\repo path'],
      readWrite: true,
    });
  });

  it('parses /switch alias /attach', () => {
    expect(parseTerminalCommand('/attach worker')).toEqual({
      type: 'switch',
      target: 'worker',
    });
  });

  it('parses /send with quoted target and message', () => {
    expect(parseTerminalCommand('/send "agent-one" review this repo')).toEqual(
      {
        type: 'send',
        target: 'agent-one',
        message: 'review this repo',
      },
    );
  });

  it('returns usage for malformed commands', () => {
    expect(parseTerminalCommand('/send only-target')).toEqual({
      type: 'unknown',
      message: 'Usage: /send <agent-name> <message>',
    });
  });

  it('completes slash commands', () => {
    expect(getTerminalCompletions('/sw', [])[0]).toContain('/switch');
  });

  it('completes agent targets for switch-like commands', () => {
    const [matches] = getTerminalCompletions('/switch re', [
      {
        jid: 'local:repo',
        name: 'repo',
        folder: 'local-repo',
        active: false,
      },
    ]);
    expect(matches).toContain('repo');
  });
});
