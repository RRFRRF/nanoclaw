/**
 * Container runtime abstraction for NanoHarness.
 * All runtime-specific logic lives here so swapping runtimes means changing one file.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

import { logger } from './logger.js';

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = 'docker';

/** Hostname containers use to reach the host machine. */
export const CONTAINER_HOST_GATEWAY = 'host.docker.internal';

const CONTAINER_RUNTIME_CHECK_TIMEOUT_MS = Math.max(
  10000,
  Number.parseInt(
    process.env.NANOCLAW_CONTAINER_RUNTIME_CHECK_TIMEOUT_MS || '30000',
    10,
  ) || 30000,
);

/**
 * Address the credential proxy binds to.
 * Docker Desktop (macOS): 127.0.0.1 because the VM routes host.docker.internal to loopback.
 * Docker (Linux): bind to the docker0 bridge IP so only containers can reach it,
 * falling back to 0.0.0.0 if the interface isn't found.
 */
export const PROXY_BIND_HOST =
  process.env.CREDENTIAL_PROXY_HOST || detectProxyBindHost();

function detectProxyBindHost(): string {
  if (os.platform() === 'darwin') return '127.0.0.1';

  // WSL uses Docker Desktop (same VM routing as macOS), so loopback is correct.
  if (fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) return '127.0.0.1';

  const ifaces = os.networkInterfaces();
  const docker0 = ifaces['docker0'];
  if (docker0) {
    const ipv4 = docker0.find((a) => a.family === 'IPv4');
    if (ipv4) return ipv4.address;
  }
  return '0.0.0.0';
}

/** CLI args needed for the container to resolve the host gateway. */
export function hostGatewayArgs(): string[] {
  if (os.platform() === 'linux') {
    return ['--add-host=host.docker.internal:host-gateway'];
  }
  return [];
}

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(
  hostPath: string,
  containerPath: string,
): string[] {
  return ['-v', `${hostPath}:${containerPath}:ro`];
}

/** Returns the shell command to stop a container by name. */
export function stopContainer(name: string): string {
  return `${CONTAINER_RUNTIME_BIN} stop -t 1 ${name}`;
}

function runContainerRuntimeCommand(args: string[]): string {
  return execFileSync(CONTAINER_RUNTIME_BIN, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: CONTAINER_RUNTIME_CHECK_TIMEOUT_MS,
    windowsHide: true,
  });
}

function formatRuntimeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const maybeErr = err as Error & {
    stderr?: Buffer | string;
    stdout?: Buffer | string;
  };

  const stderr =
    typeof maybeErr.stderr === 'string'
      ? maybeErr.stderr
      : Buffer.isBuffer(maybeErr.stderr)
        ? maybeErr.stderr.toString('utf8')
        : '';
  const stdout =
    typeof maybeErr.stdout === 'string'
      ? maybeErr.stdout
      : Buffer.isBuffer(maybeErr.stdout)
        ? maybeErr.stdout.toString('utf8')
        : '';

  return [stderr, stdout, maybeErr.message]
    .map((part) => part.trim())
    .find((part) => part.length > 0) || 'unknown runtime error';
}

/** Ensure the container runtime is running. */
export function ensureContainerRuntimeRunning(): void {
  try {
    runContainerRuntimeCommand(['info']);
    logger.debug('Container runtime already running');
  } catch (err) {
    const detail = formatRuntimeError(err);
    logger.error({ err, detail }, 'Failed to reach container runtime');
    console.error(
      '\n╔════════════════════════════════════════════════════════════════╗',
    );
    console.error(
      '║  FATAL: Container runtime failed to start                      ║',
    );
    console.error(
      '║                                                                ║',
    );
    console.error(
      '║  Agents cannot run without a container runtime. To fix:        ║',
    );
    console.error(
      '║  1. Ensure Docker is installed and running                     ║',
    );
    console.error(
      '║  2. Run: docker info                                           ║',
    );
    console.error(
      '║  3. Restart NanoHarness                                        ║',
    );
    console.error(
      '╚════════════════════════════════════════════════════════════════╝\n',
    );
    throw new Error(
      `Container runtime is required but failed to start: ${detail}`,
      {
        cause: err,
      },
    );
  }
}

/** Kill orphaned NanoClaw containers from previous runs. */
export function cleanupOrphans(): void {
  try {
    const output = runContainerRuntimeCommand([
      'ps',
      '--filter',
      'name=nanoclaw-',
      '--format',
      '{{.Names}}',
    ]);
    const orphans = output.trim().split('\n').filter(Boolean);
    for (const name of orphans) {
      try {
        runContainerRuntimeCommand(['stop', '-t', '1', name]);
      } catch {
        /* already stopped */
      }
    }
    if (orphans.length > 0) {
      logger.info(
        { count: orphans.length, names: orphans },
        'Stopped orphaned containers',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up orphaned containers');
  }
}
