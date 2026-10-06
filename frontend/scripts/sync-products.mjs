import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const flags = process.argv.slice(2);
if (flags.some((flag) => flag !== '--dry-run')) {
  console.error('Usage: npm run sync:products [-- --dry-run]');
  process.exit(1);
}
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const args = [
  'syncProducts',
  '--console=plain',
  ...(flags.includes('--dry-run') ? ['-PdryRun'] : []),
];
const command =
  process.platform === 'win32' ? resolve(backend, 'gradlew.bat') : resolve(backend, 'gradlew');
// The command and flags are fixed; no manifest values enter the shell command.
const result = spawnSync(command, args, {
  cwd: backend,
  stdio: 'inherit',
  env: { ...process.env, DEBUG: '' },
  shell: process.platform === 'win32',
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
