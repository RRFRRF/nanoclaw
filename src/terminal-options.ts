export interface TerminalOptions {
  enabled: boolean;
  logLevel?: string;
  logView: 'stderr' | 'ink';
}

function readArgValue(args: string[], name: string): string | undefined {
  const exact = `${name}=`;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === name) return args[i + 1];
    if (arg.startsWith(exact)) return arg.slice(exact.length);
  }
  return undefined;
}

export function getTerminalOptions(args: string[] = process.argv): TerminalOptions {
  const enabled = args.includes('--terminal');

  const logLevel =
    readArgValue(args, '--terminal-log-level') ||
    readArgValue(args, '--log-level');
  const rawLogView = readArgValue(args, '--terminal-log-view');
  const logView = rawLogView === 'ink' ? 'ink' : 'stderr';

  return {
    enabled,
    logLevel,
    logView,
  };
}
