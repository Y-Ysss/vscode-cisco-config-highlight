import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const runtimeRoot =
  process.env.VSCODE_TEST_CACHE_ROOT ??
  path.join(tmpdir(), 'vscode-cisco-config-highlight-tests');

mkdirSync(runtimeRoot, { recursive: true });

const testCliPath = path.join(
  projectRoot,
  'node_modules',
  '@vscode',
  'test-cli',
  'out',
  'bin.mjs',
);
const configPath = path.join(projectRoot, '.vscode-test.mjs');

console.log(`VS Code test runtime: ${runtimeRoot}`);

const result = spawnSync(
  process.execPath,
  [
    testCliPath,
    '--config',
    configPath,
    '--fail-zero',
    ...process.argv.slice(2),
  ],
  {
    cwd: runtimeRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
