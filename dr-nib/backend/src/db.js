import { config } from './env.js';
import { PrismaClient } from '@prisma/client';

// One client per process, bound to *our* schema — never the hub's. The hub's
// client comes from @nibgate/internal and is a different instance entirely.
const store = globalThis.__drnibPrisma || (globalThis.__drnibPrisma = {});

// The shared testnet cluster is reached over a proxy that can be slow to hand
// out a connection. Explicit pool + connect timeouts keep a stalled proxy from
// tripping Prisma's defaults (which surface as "Unable to start a transaction
// in the given time"). Existing params on the URL are left untouched.
function withPool(url) {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  const add = [];
  if (!/[?&]connection_limit=/.test(url)) add.push('connection_limit=5');
  if (!/[?&]pool_timeout=/.test(url)) add.push('pool_timeout=30');
  if (!/[?&]connect_timeout=/.test(url)) add.push('connect_timeout=30');
  return add.length ? `${url}${sep}${add.join('&')}` : url;
}

function withRetry(client) {
  // One database means one point of failure: when the proxy flaps, every
  // query fails at once. Transient connection errors (server unreachable,
  // connection dropped, pool timeout) are retried with backoff at this single
  // choke point, so no caller needs its own retry loop. Retried only on codes
  // that mean "never started" — never on errors that might have committed.
  const RETRYABLE = new Set(['P1001', 'P1002', 'P1017', 'P2024']);
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

export const db = store.client || (store.client = withRetry(new PrismaClient({ datasourceUrl: withPool(config.drnibDatabaseUrl) })));