import { execFileSync, execSync } from 'node:child_process';

const TEST_MAP = [
  {
    match: /^src\/container-runner\.ts$/,
    tests: [
      'src/container-runner.test.ts',
      'src/group-queue.test.ts',
      'src/task-scheduler.test.ts',
    ],
  },
  {
    match: /^src\/group-queue\.ts$/,
    tests: ['src/group-queue.test.ts', 'src/container-runner.test.ts'],
  },
  {
    match: /^src\/task-scheduler\.ts$/,
    tests: ['src/task-scheduler.test.ts', 'src/container-runner.test.ts'],
  },
  {
    match: /^src\/terminal-channel\.ts$/,
    tests: ['src/terminal-channel.test.ts'],
  },
  {
    match: /^src\/credential-proxy\.ts$/,
    tests: ['src/credential-proxy.test.ts'],
  },
  {
    match: /^src\/db\.ts$/,
    tests: ['src/db.test.ts'],
  },
  {
    match: /^src\/routing?\.ts$/,
    tests: ['src/routing.test.ts', 'src/formatting.test.ts'],
  },
  {
    match: /^src\/index\.ts$/,
    tests: [
      'src/container-runner.test.ts',
      'src/group-queue.test.ts',
      'src/task-scheduler.test.ts',
      'src/terminal-channel.test.ts',
    ],
  },
  {
    match: /^container\/agent-runner\/src\//,
    tests: [
      'src/container-runner.test.ts',
      'src/group-queue.test.ts',
      'src/task-scheduler.test.ts',
    ],
  },
  {
    match: /^container\/skills\//,
    tests: ['src/container-runner.test.ts', 'src/terminal-channel.test.ts'],
  },
];

const BUILD_PATTERNS = [
  /^src\//,
  /^container\/agent-runner\/src\//,
  /^container\/skills\//,
  /^package\.json$/,
  /^tsconfig\.json$/,
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

function getChangedFiles() {
  const output = execFileSync('git', ['status', '--short'], {
    encoding: 'utf8',
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const normalized = line.replace(/^[A-Z? ]+\s+/, '');
      const renameParts = normalized.split(' -> ');
      return renameParts[renameParts.length - 1].replace(/\\/g, '/');
    });
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const changedFiles = getChangedFiles();

if (changedFiles.length === 0) {
  console.log('No changed files detected. Running build only.');
  run(npmCmd, ['run', 'build']);
  process.exit(0);
}

console.log('Changed files:');
for (const file of changedFiles) {
  console.log(`- ${file}`);
}

const tests = new Set();
let shouldBuild = false;

for (const file of changedFiles) {
  if (BUILD_PATTERNS.some((pattern) => pattern.test(file))) {
    shouldBuild = true;
  }

  for (const rule of TEST_MAP) {
    if (rule.match.test(file)) {
      for (const testFile of rule.tests) {
        tests.add(testFile);
      }
    }
  }
}

if (shouldBuild) {
  console.log('\n==> Building NanoClaw');
  run(npmCmd, ['run', 'build']);
}

if (tests.size === 0) {
  console.log('\nNo mapped Vitest files for the current diff.');
  process.exit(0);
}

const selectedTests = [...tests];
console.log('\n==> Running affected tests');
for (const testFile of selectedTests) {
  console.log(`- ${testFile}`);
}

run(npxCmd, ['vitest', 'run', ...selectedTests]);
