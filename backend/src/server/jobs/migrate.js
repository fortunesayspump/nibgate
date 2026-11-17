import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '@nibgate/internal/db.js';

// Apply ONLY this additive migration. Never deploy the repository's entire
// historical migration set onto an already provisioned production database.
const migration = '20261117000000_add_background_job_state';
const sql = await readFile(new URL(`../../../../packages/cli/prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
try {
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1852400231, 170001)`;
    const exists = await tx.$queryRaw`SELECT to_regclass('public."BackgroundJobState"')::text AS name`;
    if (!exists[0].name) await tx.$executeRawUnsafe(sql);
    const columns = await tx.$queryRaw`SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'BackgroundJobState'`;
    const expected = { key: 'text', owner: 'text', leaseUntil: 'timestamp without time zone', completedAt: 'timestamp without time zone', cursor: 'text' };
    if (columns.length !== 5 || columns.some(c => expected[c.column_name] !== c.data_type)) throw Error('Existing job-state schema differs');
    const ledger = await tx.$queryRaw`SELECT to_regclass('public._prisma_migrations')::text AS name`;
    if (ledger[0].name) {
      const rows = await tx.$queryRaw`SELECT checksum, finished_at FROM "_prisma_migrations" WHERE migration_name = ${migration} AND rolled_back_at IS NULL`;
      if (rows.length && rows.some(row => row.checksum !== checksum || !row.finished_at)) throw Error('Migration ledger differs');
      if (!rows.length) await tx.$executeRaw`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
        VALUES (${randomUUID()}, ${checksum}, CURRENT_TIMESTAMP, ${migration}, CURRENT_TIMESTAMP, 1)`;
    }
  });
  console.log('[jobs-migration] BackgroundJobState ready');
} finally { await db.$disconnect(); }
