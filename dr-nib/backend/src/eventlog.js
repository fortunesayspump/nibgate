// Durable event log.
//
// Every run event is written to Postgres *before* it is broadcast on the live
// SSE channel. That ordering is the whole point: a client that disconnects at
// step five reconnects and replays from step six, and the run's entire history
// is inspectable after the fact. `seq` is per-run and monotonic, so replay is
// exact (`?after=<seq>` or the SSE Last-Event-ID header).
import { db } from './db.js';
import { publish } from './events.js';

/**
 * Persist then broadcast one event. Returns the stored row (with its seq).
 * Called with `await` everywhere so events cannot be reordered or lost.
 */
export async function recordEvent(runId, event) {
  const row = await db.$transaction(async (tx) => {
    const last = await tx.researchEvent.findFirst({ where: { runId }, orderBy: { seq: 'desc' }, select: { seq: true } });
    const seq = (last?.seq ?? -1) + 1;
    return tx.researchEvent.create({
      data: { runId, seq, type: String(event?.type || 'event'), payload: event ?? {} },
    });
  });
  publish(runId, { ...event, seq: row.seq });
  return row;
}

/** Replay stored events with seq greater than `afterSeq`, oldest first. */
export async function replayEvents(runId, afterSeq = -1, limit = 500) {
  const rows = await db.researchEvent.findMany({
    where: { runId, seq: { gt: Number(afterSeq) } },
    orderBy: { seq: 'asc' },
    take: Math.min(Math.max(Number(limit) || 500, 1), 1000),
  });
  return rows.map((r) => ({ ...(r.payload || {}), seq: r.seq }));
}
