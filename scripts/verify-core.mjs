import { execSync } from 'node:child_process';

const VITEST_CORE_FILES = [
  'src/container-runner.test.ts',
  'src/group-queue.test.ts',
  'src/task-scheduler.test.ts',
  'src/terminal-channel.test.ts',
  'src/credential-proxy.test.ts',
  'src/db.test.ts',
];

function quote(arg) {
  return /[\s"]/u.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function run(command, args) {
  try {
    execSync([command, ...args].map(quote).join(' '), {
      stdio: 'inherit',
    });
  } catch (error) {
    process.exit(error.status ?? 1);
  }
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log('==> Building NanoClaw');
run(npmCmd, ['run', 'build']);

console.log('\n==> Running core regression tests');
run(npxCmd, ['vitest', 'run', ...VITEST_CORE_FILES]);
