import React, { useEffect, useMemo, useState } from 'react';
import { Box, render, Static, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';

export type InkMessageTone = 'user' | 'agent' | 'system' | 'error' | 'status';

export interface InkMessage {
  id: string;
  label: string;
  text: string;
  tone: InkMessageTone;
  mergeKey?: string;
  mergeMode?: 'append' | 'replace';
}

export interface InkContext {
  agentLabel: string;
  status: string;
  sessionId?: string | null;
  containerName?: string | null;
  hint?: string;
}

interface InkSnapshot {
  messages: InkMessage[];
  liveMessage: InkMessage | null;
  context: InkContext;
}

interface InkAppProps {
  store: TerminalInkStore;
  onSubmit: (line: string) => Promise<void> | void;
  onExit: () => void;
  getHint: (input: string) => string;
  getCompletions: (input: string) => string[];
  getPreviousHistory: () => string | null;
  getNextHistory: () => string | null;
}

type Listener = () => void;

function sanitizeText(text: string, trim: boolean = true): string {
  const normalized = text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  return trim ? normalized.trim() : normalized;
}

function toneColor(tone: InkMessageTone): string {
  switch (tone) {
    case 'user':
      return 'cyan';
    case 'agent':
      return 'green';
    case 'error':
      return 'red';
    case 'status':
      return 'yellow';
    default:
      return 'blue';
  }
}

function messageLines(text: string): string[] {
  const cleaned = sanitizeText(text, false);
  const lines = cleaned.split('\n');
  return lines.length > 0 ? lines : [''];
}

function MessageBlock({ message }: { message: InkMessage }): React.JSX.Element {
  const lines = messageLines(message.text);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={toneColor(message.tone)} bold>
        {message.label}
      </Text>
      {lines.map((line, index) => (
        <Text key={`${message.id}-${index}`}>
          <Text color={toneColor(message.tone)}>|</Text> {line}
        </Text>
      ))}
    </Box>
  );
}

function TerminalInkApp(props: InkAppProps): React.JSX.Element {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState<InkSnapshot>(props.store.getSnapshot());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [completionHint, setCompletionHint] = useState('');

  useEffect(() => props.store.subscribe(() => setSnapshot(props.store.getSnapshot())), [
    props.store,
  ]);

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      props.onExit();
      exit();
      return;
    }

    if (key.upArrow) {
      const previous = props.getPreviousHistory();
      if (previous !== null) setInput(previous);
      return;
    }

    if (key.downArrow) {
      const next = props.getNextHistory();
      if (next !== null) setInput(next);
      return;
    }

    if (key.tab) {
      const completions = props.getCompletions(input);
      if (completions.length === 0) {
        setCompletionHint('No completion candidates');
        return;
      }

      if (completions.length === 1) {
        setInput(completions[0]);
        setCompletionHint('');
        return;
      }

      let prefix = completions[0];
      for (let i = 1; i < completions.length; i += 1) {
        while (!completions[i].startsWith(prefix) && prefix.length > 0) {
          prefix = prefix.slice(0, -1);
        }
      }

      if (prefix.length > input.length) {
        setInput(prefix);
        setCompletionHint('');
        return;
      }

      setCompletionHint(
        `Matches: ${completions.slice(0, 8).join(', ')}${completions.length > 8 ? ', ...' : ''}`,
      );
    }
  });

  const hint = useMemo(
    () => completionHint || props.getHint(input) || snapshot.context.hint || '',
    [completionHint, input, props, snapshot.context.hint],
  );

  const submit = async (value: string) => {
    const line = value.trim();
    setInput('');
    setCompletionHint('');
    if (!line || busy) return;
    setBusy(true);
    try {
      await props.onSubmit(line);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box flexDirection="column">
      <Static items={snapshot.messages}>
        {(item) => <MessageBlock key={item.id} message={item} />}
      </Static>

      {snapshot.liveMessage ? <MessageBlock message={snapshot.liveMessage} /> : null}

      <Box flexDirection="column" marginTop={0}>
        <Text color="gray">
          agent {snapshot.context.agentLabel}  status {snapshot.context.status}
          {'  '}session {snapshot.context.sessionId || '-'}
          {'  '}container {snapshot.context.containerName || '-'}
        </Text>
        <Box>
          <Text color="cyan">{'> '}</Text>
          <TextInput value={input} onChange={setInput} onSubmit={submit} />
        </Box>
        <Text color="gray">{hint}</Text>
      </Box>
    </Box>
  );
}

export class TerminalInkStore {
  private snapshot: InkSnapshot = {
    messages: [],
    liveMessage: null,
    context: {
      agentLabel: 'no-agent',
      status: 'idle',
      sessionId: null,
      containerName: null,
      hint: '',
    },
  };

  private listeners = new Set<Listener>();
  private liveFinalizeTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): InkSnapshot {
    return this.snapshot;
  }

  setContext(context: InkContext): void {
    this.snapshot = {
      ...this.snapshot,
      context,
    };
    this.emit();
  }

  addMessage(message: InkMessage): void {
    const text = sanitizeText(message.text, false);
    if (!text.trim()) return;

    if (message.tone === 'agent' && message.mergeKey) {
      const live = this.snapshot.liveMessage;
      if (
        live &&
        live.tone === 'agent' &&
        live.mergeKey === message.mergeKey &&
        live.label === message.label
      ) {
        live.text =
          message.mergeMode === 'replace'
            ? text
            : live.text
              ? `${live.text}\n${text}`
              : text;
        this.restartLiveFinalizeTimer();
        this.emit();
        return;
      }

      this.flushLiveMessage();
      this.snapshot = {
        ...this.snapshot,
        liveMessage: { ...message, text },
      };
      this.restartLiveFinalizeTimer();
      this.emit();
      return;
    }

    this.flushLiveMessage();
    this.snapshot = {
      ...this.snapshot,
      messages: [...this.snapshot.messages, { ...message, text }],
    };
    this.emit();
  }

  completeMessage(message: InkMessage): void {
    const text = sanitizeText(message.text, false);
    const live = this.snapshot.liveMessage;
    if (
      live &&
      message.tone === 'agent' &&
      message.mergeKey &&
      live.tone === 'agent' &&
      live.mergeKey === message.mergeKey &&
      live.label === message.label
    ) {
      if (text.trim()) {
        live.text = text;
      }
      this.flushLiveMessage();
      return;
    }

    this.addMessage(message);
  }

  flushLiveMessage(): void {
    if (!this.snapshot.liveMessage) return;
    this.clearLiveFinalizeTimer();
    this.snapshot = {
      ...this.snapshot,
      messages: [...this.snapshot.messages, this.snapshot.liveMessage],
      liveMessage: null,
    };
    this.emit();
  }

  dispose(): void {
    this.clearLiveFinalizeTimer();
    this.listeners.clear();
  }

  private restartLiveFinalizeTimer(): void {
    this.clearLiveFinalizeTimer();
    this.liveFinalizeTimer = setTimeout(() => {
      this.flushLiveMessage();
    }, 800);
  }

  private clearLiveFinalizeTimer(): void {
    if (this.liveFinalizeTimer) {
      clearTimeout(this.liveFinalizeTimer);
      this.liveFinalizeTimer = null;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export function mountTerminalInkApp(props: InkAppProps): {
  unmount: () => void;
} {
  const instance = render(<TerminalInkApp {...props} />);
  return {
    unmount: () => instance.unmount(),
  };
}
