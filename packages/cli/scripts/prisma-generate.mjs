// Generates the package's Prisma client into prisma/generated/<name> so each
// app owns its client and a sibling schema can never clobber it (the pnpm
// shared-.prisma-dir failure mode). Generation needs no DATABASE_URL — only
// migrations do — so this always runs.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync('npx', ['--yes', 'prisma', 'generate'], {
  cwd: path.resolve(here, '..'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
