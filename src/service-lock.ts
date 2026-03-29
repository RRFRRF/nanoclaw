import fs from 'fs';
import path from 'path';

import { STORE_DIR } from './config.js';

const LOCK_PATH = path.join(STORE_DIR, 'service.lock.json');

let releaseFn: (() => void) | null = null;

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireServiceLock(): void {
  if (releaseFn) return;

  fs.mkdirSync(STORE_DIR, { recursive: true });

  try {
    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeFileSync(
      fd,
      JSON.stringify(
        {
          pid: process.pid,
          startedAt: new Date().toISOString(),
          cwd: process.cwd(),
        },
        null,
        2,
      ) + '\n',
    );
    fs.closeSync(fd);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }

    let existingPid: number | null = null;
    try {
      const existing = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8')) as {
        pid?: number;
      };
      existingPid = typeof existing.pid === 'number' ? existing.pid : null;
    } catch {
      existingPid = null;
    }

    if (existingPid && isProcessRunning(existingPid)) {
      throw new Error(
        `NanoClaw is already running in another process (pid ${existingPid}). Stop it before starting a new terminal instance.`,
      );
    }

    try {
      fs.rmSync(LOCK_PATH, { force: true });
    } catch {
      // ignore stale lock removal failure; retry will surface a real error
    }

    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeFileSync(
      fd,
      JSON.stringify(
        {
          pid: process.pid,
          startedAt: new Date().toISOString(),
          cwd: process.cwd(),
        },
        null,
        2,
      ) + '\n',
    );
    fs.closeSync(fd);
  }

  releaseFn = () => {
    try {
      const existing = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8')) as {
        pid?: number;
      };
      if (existing.pid && existing.pid !== process.pid) return;
    } catch {
      // ignore malformed or missing lock files
    }
    try {
      fs.rmSync(LOCK_PATH, { force: true });
    } catch {
      // ignore
    }
  };

  process.once('exit', () => releaseFn?.());
}

export function releaseServiceLock(): void {
  releaseFn?.();
  releaseFn = null;
}
