import { randomUUID } from 'node:crypto';

// Atomic, database-clock leases serialize duplicate cron services/manual runs.
// The supervisor kills the worker BEFORE the lease can expire. No heartbeat
// or resident polling connection is needed. Never use this for money jobs.
export async function runLeasedJob({ db, key, intervalMs, timeoutMs, run }) {
  const owner = randomUUID();
  const leaseMs = timeoutMs * 2 + 60_000;
  const rows = await db.$queryRaw`
    INSERT INTO "BackgroundJobState" ("key", "owner", "leaseUntil")
    VALUES (${key}, ${owner}, CURRENT_TIMESTAMP + ${leaseMs} * INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "owner" = EXCLUDED."owner", "leaseUntil" = EXCLUDED."leaseUntil"
    WHERE ("BackgroundJobState"."leaseUntil" IS NULL OR "BackgroundJobState"."leaseUntil" < CURRENT_TIMESTAMP)
      AND ("BackgroundJobState"."completedAt" IS NULL OR "BackgroundJobState"."completedAt" < to_timestamp(floor(extract(epoch FROM CURRENT_TIMESTAMP) * 1000 / ${intervalMs}) * ${intervalMs} / 1000))
    RETURNING "cursor"`;
  if (!rows.length) return { skipped: true };
  try {
    const checkpoint = async (cursor) => {
      const changed = await db.$executeRaw`UPDATE "BackgroundJobState" SET "cursor" = ${cursor}
        WHERE "key" = ${key} AND "owner" = ${owner} AND "leaseUntil" > CURRENT_TIMESTAMP`;
      if (changed !== 1) throw new Error('Background job lease lost');
    };
    const cursor = await run(rows[0].cursor, checkpoint);
    const changed = await db.$executeRaw`
      UPDATE "BackgroundJobState" SET "cursor" = ${cursor ?? rows[0].cursor},
        "completedAt" = "leaseUntil" - ${leaseMs} * INTERVAL '1 millisecond', "owner" = NULL, "leaseUntil" = NULL
      WHERE "key" = ${key} AND "owner" = ${owner} AND "leaseUntil" > CURRENT_TIMESTAMP`;
    if (changed !== 1) throw new Error('Background job lease lost');
    return { skipped: false };
  } catch (error) {
    await db.$executeRaw`UPDATE "BackgroundJobState" SET "owner" = NULL, "leaseUntil" = NULL
      WHERE "key" = ${key} AND "owner" = ${owner}`;
    throw error;
  }
}
