import React, { useEffect, useMemo, useState } from 'react';
import { Box, render, Static, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { TerminalCommandMenuItem } from './terminal-channel.js';

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
  getCommandMenuItems: (input: string) => TerminalCommandMenuItem[];
  applyCommandMenuItem: (
    input: string,
    item: TerminalCommandMenuItem,
  ) => string;
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

function StatusPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Text>
      <Text color="gray">{label} </Text>
      <Text color={color} bold>
        {value}
      </Text>
    </Text>
  );
}

function CommandMenu({
  items,
  selectedIndex,
}: {
  items: TerminalCommandMenuItem[];
  selectedIndex: number;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  const maxVisible = 6;
  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(maxVisible / 2), items.length - maxVisible),
  );
  const visibleItems = items.slice(windowStart, windowStart + maxVisible);
  const windowEnd = windowStart + visibleItems.length;

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      <Text color="gray">
        Commands {selectedIndex + 1}/{items.length}
      </Text>
      {windowStart > 0 ? <Text color="gray">↑ more</Text> : null}
      {visibleItems.map((item, index) => {
        const actualIndex = windowStart + index;
        const selected = actualIndex === selectedIndex;
        return (
          <Box key={`${item.kind}-${item.label}-${actualIndex}`}>
            <Text
              color={selected ? 'black' : 'cyan'}
              backgroundColor={selected ? 'cyan' : undefined}
            >
              {item.label}
            </Text>
            <Text color="gray">  {item.detail}</Text>
            {item.description ? (
              <Text color="gray"> — {item.description}</Text>
            ) : null}
          </Box>
        );
      })}
      {windowEnd < items.length ? <Text color="gray">↓ more</Text> : null}
    </Box>
  );
}

function TerminalInkApp(props: InkAppProps): React.JSX.Element {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState<InkSnapshot>(props.store.getSnapshot());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [completionHint, setCompletionHint] = useState('');
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);

  useEffect(() => props.store.subscribe(() => setSnapshot(props.store.getSnapshot())), [
    props.store,
  ]);

  const commandMenuItems = useMemo(
    () => (busy ? [] : props.getCommandMenuItems(input)),
    [busy, input, props],
  );

  useEffect(() => {
    if (commandMenuItems.length === 0) {
      setSelectedMenuIndex(0);
      return;
    }
    setSelectedMenuIndex((current) => Math.min(current, commandMenuItems.length - 1));
  }, [commandMenuItems]);

  const getSelectedMenuApplication = () => {
    const item = commandMenuItems[selectedMenuIndex];
    if (!item) return null;
    const nextInput = props.applyCommandMenuItem(input, item);
    return { item, nextInput, changed: nextInput !== input };
  };

  const shouldSubmitSlashCommand = () => {
    if (!input.startsWith('/')) return false;
    const trimmed = input.trim();
    if (!trimmed || trimmed === '/') return false;
    return commandMenuItems.length === 0;
  };

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      props.onExit();
      exit();
      return;
    }

    if (commandMenuItems.length > 0) {
      if (key.escape) {
        setSelectedMenuIndex(0);
        setCompletionHint('');
        return;
      }

      if (key.upArrow) {
        setSelectedMenuIndex((current) =>
          current <= 0 ? commandMenuItems.length - 1 : current - 1,
        );
        return;
      }

      if (key.downArrow) {
        setSelectedMenuIndex((current) => (current + 1) % commandMenuItems.length);
        return;
      }

      if (key.tab) {
        const selection = getSelectedMenuApplication();
        if (selection) {
          setInput(selection.nextInput);
          setSelectedMenuIndex(0);
          setCompletionHint('');
          return;
        }
      }

      if (key.return) {
        if (shouldSubmitSlashCommand()) {
          return;
        }
        const selection = getSelectedMenuApplication();
        if (selection?.changed) {
          setInput(selection.nextInput);
          setSelectedMenuIndex(0);
          setCompletionHint('');
          return;
        }
      }
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

  const selectedMenuItem = commandMenuItems[selectedMenuIndex];
  const hint = useMemo(() => {
    if (selectedMenuItem) {
      return `${selectedMenuItem.detail}${selectedMenuItem.description ? ` — ${selectedMenuItem.description}` : ''} · Enter 应用，再次 Enter 发送`;
    }
    return completionHint || props.getHint(input) || snapshot.context.hint || '';
  }, [completionHint, input, props, selectedMenuItem, snapshot.context.hint]);

  const submit = async (value: string) => {
    const line = value.trim();
    setCompletionHint('');
    if (!line || busy) return;
    if (line === '/') return;
    setBusy(true);
    try {
      await props.onSubmit(line);
      setInput('');
      setSelectedMenuIndex(0);
    } finally {
      setBusy(false);
    }
  };

  const statusColor = snapshot.context.status === 'idle' ? 'yellow' : 'green';

  return (
    <Box flexDirection="column">
      <Static items={snapshot.messages}>
        {(item) => <MessageBlock key={item.id} message={item} />}
      </Static>

      {snapshot.liveMessage ? <MessageBlock message={snapshot.liveMessage} /> : null}

      <Box flexDirection="column" marginTop={0}>
        <Box gap={2}>
          <StatusPill label="agent" value={snapshot.context.agentLabel} color="cyan" />
          <StatusPill label="status" value={snapshot.context.status} color={statusColor} />
          <StatusPill label="session" value={snapshot.context.sessionId || '-'} color="magenta" />
          <StatusPill label="container" value={snapshot.context.containerName || '-'} color="blue" />
        </Box>
        <Box marginTop={1}>
          <Text color={input.startsWith('/') ? 'yellow' : 'cyan'}>{'> '}</Text>
          <TextInput
            key={input}
            value={input}
            onChange={setInput}
            onSubmit={submit}
          />
        </Box>
        <CommandMenu items={commandMenuItems} selectedIndex={selectedMenuIndex} />
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
              ? `${live.text}${text}`
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
