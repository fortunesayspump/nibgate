import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runLeasedJob } from './state.js';

// Explicit local fixture only; never consumes DATABASE_URL or a project .env.
const url = process.env.NIBGATE_JOB_TEST_DATABASE_URL;
const parsed = url ? new URL(url) : null;
if (parsed && (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/nibgate_jobs_fixture')) throw Error('Only disposable localhost nibgate_jobs_fixture DB allowed');

describe.skipIf(!url)('Postgres cron leases/checkpoints', () => {
  it('applies additive DDL; serializes claims, replays failure, resumes expired claims and dedupes the current UTC slot', async () => {
    const require = createRequire(import.meta.url);
    const { PrismaClient } = require(process.env.NIBGATE_JOB_TEST_PRISMA_CLIENT);
    const db = new PrismaClient({ datasources: { db: { url } } });
    const db2 = new PrismaClient({ datasources: { db: { url } } });
    try {
      const sql = await readFile(new URL('../../../../packages/cli/prisma/migrations/20261117000000_add_background_job_state/migration.sql', import.meta.url), 'utf8');
      await db.$executeRawUnsafe(sql);
      const key = 'fixture:reputation';
      let release;
      let began;
      const started = new Promise(resolve => { began = resolve; });
      const blocked = new Promise(resolve => { release = resolve; });
      const options = { key, intervalMs: 300000, timeoutMs: 1000 };
      const first = runLeasedJob({ ...options, db, run: async cursor => { expect(cursor).toBeNull(); began(); await blocked; return '5000'; } });
      await started;
      expect(await runLeasedJob({ ...options, db: db2, run: () => { throw Error('overlap'); } })).toEqual({ skipped: true });
      release(); await first;
      expect(await runLeasedJob({ ...options, db, run: () => { throw Error('duplicate'); } })).toEqual({ skipped: true });
      await db.$executeRaw`UPDATE "BackgroundJobState" SET "completedAt" = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE "key" = ${key}`;
      await expect(runLeasedJob({ ...options, db, run: async cursor => { expect(cursor).toBe('5000'); throw Error('RPC failure'); } })).rejects.toThrow('RPC failure');
      let rows = await db.$queryRaw`SELECT * FROM "BackgroundJobState" WHERE "key" = ${key}`;
      expect(rows[0]).toMatchObject({ cursor: '5000', owner: null, leaseUntil: null });
      await db.$executeRaw`UPDATE "BackgroundJobState" SET "owner" = 'crashed-worker', "leaseUntil" = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE "key" = ${key}`;
      await runLeasedJob({ ...options, db, run: async cursor => { expect(cursor).toBe('5000'); return '10000'; } });
      rows = await db.$queryRaw`SELECT * FROM "BackgroundJobState" WHERE "key" = ${key}`;
      expect(rows[0]).toMatchObject({ cursor: '10000', owner: null, leaseUntil: null });
    } finally { await Promise.all([db.$disconnect(), db2.$disconnect()]); }
  });
});
