import { db } from './db.js';

// Short database transactions only: serialize claims and ledger mutations
// across API/worker processes without holding a connection during model calls.
export const withRunLock = (runId, action) => db.$transaction(async tx => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
  return action(tx);
}, { maxWait: 10000, timeout: 15000 });
