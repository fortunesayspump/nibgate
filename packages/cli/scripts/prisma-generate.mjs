// Use this package's installed Prisma CLI; generation never needs registry access.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'generate'], {
  cwd: path.resolve(here, '..'), stdio: 'inherit',
});
process.exit(result.status ?? 1);
