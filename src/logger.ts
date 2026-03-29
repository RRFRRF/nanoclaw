import pino from 'pino';
import { Writable } from 'stream';

import { getTerminalOptions } from './terminal-options.js';
import {
  pushTerminalLogRecord,
  pushTerminalLogText,
} from './terminal-log-sink.js';

function createTerminalLogStream(): Writable {
  let buffer = '';
  return new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            pushTerminalLogRecord(JSON.parse(line) as Record<string, unknown>);
          } catch {
            pushTerminalLogText(line);
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }

      callback();
    },
  });
}

export function createLogger(): pino.Logger {
  const terminalOptions = getTerminalOptions();
  const effectiveLevel =
    terminalOptions.logLevel ||
    (terminalOptions.enabled ? 'error' : process.env.LOG_LEVEL || 'info');
  const logToTerminalUi =
    terminalOptions.enabled && terminalOptions.logView === 'ink';

  if (logToTerminalUi) {
    return pino(
      {
        level: effectiveLevel,
        base: { pid: process.pid },
      },
      createTerminalLogStream(),
    );
  }

  return pino({
    level: effectiveLevel,
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, destination: 2 },
    },
  });
}

export const logger = createLogger();

// Route uncaught errors through pino so they get timestamps in stderr
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});
