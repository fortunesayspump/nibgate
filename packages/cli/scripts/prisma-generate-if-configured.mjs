import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.log('Skipping Prisma generate because DATABASE_URL is not set.');
  process.exit(0);
}

const result = spawnSync('prisma', ['generate'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(result.status ?? 1);
