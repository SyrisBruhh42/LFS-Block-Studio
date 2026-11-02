import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? discover(path) : path.endsWith('.test.ts') ? [path] : [];
  });
}

// Running each file directly preserves its named node:test assertions in this toolchain.
let failures = 0;
for (const path of discover('src').sort()) {
  process.stdout.write(`\n${path}\n`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', path], { stdio: 'inherit' });
  if (result.error || result.status !== 0 || result.signal) {
    failures++;
    if (result.error) process.stderr.write(`${result.error.message}\n`);
  }
}
process.exitCode = failures ? 1 : 0;
