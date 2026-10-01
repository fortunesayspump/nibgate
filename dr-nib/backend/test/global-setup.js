// Pushes the schema once per test run, into the throwaway schema named in
// .env.test. Doing it here rather than by hand means a fresh clone can run
// `pnpm test` with nothing else set up.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

export default function globalSetup() {
  const root = path.resolve(import.meta.dirname, '..');
  dotenv.config({ path: path.join(root, '.env.test') });

  const url = process.env.DRNIB_DATABASE_URL || '';
  if (!/[?&]schema=drnib_test\b/.test(url)) {
    throw new Error(`Refusing to prepare ${url || '(nothing)'}. DRNIB_DATABASE_URL must name a schema ending in _test.`);
  }

  const require = createRequire(import.meta.url);
  const prisma = require.resolve('prisma/build/index.js');

  execFileSync(process.execPath, [prisma, 'db', 'push', '--skip-generate', '--accept-data-loss', `--schema=${path.join(root, 'prisma', 'schema.prisma')}`], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, DRNIB_DATABASE_URL: url },
    stdio: 'inherit',
  });
}