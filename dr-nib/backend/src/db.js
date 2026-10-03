import { config } from './env.js';
import { PrismaClient } from '@prisma/client';

// One client per process, bound to *our* schema — never the hub's. The hub's
// client comes from @nibgate/internal and is a different instance entirely.
const store = globalThis.__drnibPrisma || (globalThis.__drnibPrisma = {});

function withRetry(client) {
  // One database means one point of failure: when the proxy flaps, every
  // query fails at once. Transient connection errors (server unreachable,
  // connection dropped) are retried with backoff at this single choke point,
  // so no caller needs its own retry loop. Retried only on codes that mean
  // "never started" — never on errors that might have committed.
  const RETRYABLE = new Set(['P1001', 'P1017']);
  const waits = [300, 1000, 2500];
  return client.$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        let last;
        for (let attempt = 0; attempt <= waits.length; attempt += 1) {
          try {
            return await query(args);
          } catch (err) {
            last = err;
            if (!RETRYABLE.has(err?.code) || attempt === waits.length) throw err;
            await new Promise((r) => setTimeout(r, waits[attempt]));
          }
        }
        throw last;
      },
    },
  });
}

export const db = store.client || (store.client = withRetry(new PrismaClient({ datasourceUrl: config.drnibDatabaseUrl })));