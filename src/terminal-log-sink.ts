export type TerminalLogItem =
  | { type: 'record'; record: Record<string, unknown> }
  | { type: 'text'; text: string };

type TerminalLogListener = (item: TerminalLogItem) => void;

const buffer: TerminalLogItem[] = [];
const listeners = new Set<TerminalLogListener>();
const MAX_BUFFER = 500;

function push(item: TerminalLogItem): void {
  buffer.push(item);
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }
  for (const listener of listeners) {
    listener(item);
  }
}

export function pushTerminalLogRecord(record: Record<string, unknown>): void {
  push({ type: 'record', record });
}

export function pushTerminalLogText(text: string): void {
  push({ type: 'text', text });
}

export function subscribeTerminalLogs(
  listener: TerminalLogListener,
  options?: { replay?: boolean },
): () => void {
  listeners.add(listener);
  if (options?.replay !== false) {
    for (const item of buffer) {
      listener(item);
    }
  }
  return () => listeners.delete(listener);
}
