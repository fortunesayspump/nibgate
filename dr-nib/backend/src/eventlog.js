// Durable event log.
//
// Every run event is written to Postgres *before* it is broadcast on the live
// SSE channel. That ordering is the whole point: a client that disconnects at
// step five reconnects and replays from step six, and the run's entire history
// is inspectable after the fact. `seq` is per-run and monotonic, so replay is
// exact (`?after=<seq>` or the SSE Last-Event-ID header).
import { db } from './db.js';
import { publish } from './events.js';

// The shared testnet Postgres is reached through a proxy that occasionally
// stalls a connection long enough for Prisma's interactive-transaction
// maxWait to lapse ("Unable to start a transaction in the given time"), or
// drops it outright (P1001/P1017/P2024). An event write is not optional —
// losing one breaks replay — so it is retried with backoff. Only transient
// connection failures retry; anything else propagates.
const TRANSIENT = /P1001|P1017|P2024|Unable to start a transaction|Timed out fetching a new connection|connection pool|Server has closed the connection/i;

async function withRetry(fn, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!TRANSIENT.test(`${err?.code || ''} ${err?.message || ''}`)) throw err;
      await new Promise((r) => setTimeout(r, [400, 1200, 3000][i] ?? 3000));
    }
  }
  throw last;
}

/**
 * Persist then broadcast one event. Returns the stored row (with its seq).
 * Called with `await` everywhere so events cannot be reordered or lost.
 */
export async function recordEvent(runId, event) {
  // Stamp the clock into the stored payload too, not just the live broadcast
  // — replay readers (run detail, reconnects) must see the same time.
  const stamped = { ...(event ?? {}), at: event?.at || new Date().toISOString() };
  const row = await withRetry(() => db.$transaction(async (tx) => {
    const last = await tx.researchEvent.findFirst({ where: { runId }, orderBy: { seq: 'desc' }, select: { seq: true } });
    const seq = (last?.seq ?? -1) + 1;
    return tx.researchEvent.create({
      data: { runId, seq, type: String(stamped.type || 'event'), payload: stamped },
    });
  }, { maxWait: 20_000, timeout: 30_000 }));
  publish(runId, { ...stamped, seq: row.seq });
  return row;
}

/** Replay stored events with seq greater than `afterSeq`, oldest first. */
export async function replayEvents(runId, afterSeq = -1, limit = 500) {
  const rows = await db.researchEvent.findMany({
    where: { runId, seq: { gt: Number(afterSeq) } },
    orderBy: { seq: 'asc' },
    take: Math.min(Math.max(Number(limit) || 500, 1), 1000),
  });
  // Stored payloads predate the persisted clock: the live channel stamps `at`
  // at broadcast, but the row only carries createdAt. Prefer the payload's
  // own stamp when present, otherwise the row's — an event without a time
  // sorts to the epoch and scrambles every timeline that merges sources.
  return rows.map((r) => ({ ...(r.payload || {}), at: r.payload?.at || r.createdAt, seq: r.seq }));
}
