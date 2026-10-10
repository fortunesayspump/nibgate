import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.js';
import { recordEvent, replayEvents } from './eventlog.js';

const RUN = 'aaaaaaaa-0000-4000-8000-0000000000e1';

beforeEach(async () => {
  await db.researchEvent.deleteMany({ where: { runId: RUN } });
  await db.researchRun.deleteMany({ where: { id: RUN } });
  await db.researchRun.create({ data: { id: RUN, userId: 'user-1', brief: { topic: 't' }, status: 'running' } });
});
afterEach(async () => {
  await db.researchEvent.deleteMany({ where: { runId: RUN } });
  await db.researchRun.deleteMany({ where: { id: RUN } });
});

describe('durable event log', () => {
  it('assigns monotonic per-run sequence numbers', async () => {
    await recordEvent(RUN, { type: 'step.started', kind: 'search' });
    await recordEvent(RUN, { type: 'step.finished', kind: 'search' });
    const rows = await db.researchEvent.findMany({ where: { runId: RUN }, orderBy: { seq: 'asc' } });
    expect(rows.map((r) => r.seq)).toEqual([0, 1]);
    expect(rows[0].type).toBe('step.started');
  });

  it('replays everything from the start by default, in order', async () => {
    await recordEvent(RUN, { type: 'a' });
    await recordEvent(RUN, { type: 'b' });
    await recordEvent(RUN, { type: 'c' });
    const replayed = await replayEvents(RUN, -1);
    expect(replayed.map((e) => e.type)).toEqual(['a', 'b', 'c']);
    expect(replayed.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it('replays only events after the client cursor', async () => {
    await recordEvent(RUN, { type: 'a' });
    await recordEvent(RUN, { type: 'b' });
    await recordEvent(RUN, { type: 'c' });
    const replayed = await replayEvents(RUN, 0); // client got seq 0 already
    expect(replayed.map((e) => e.type)).toEqual(['b', 'c']);
  });

  it('scopes sequence numbers per run', async () => {    const OTHER = 'aaaaaaaa-0000-4000-8000-0000000000e2';
    await db.researchRun.create({ data: { id: OTHER, userId: 'user-1', brief: {}, status: 'running' } });
    await recordEvent(RUN, { type: 'a' });
    await recordEvent(OTHER, { type: 'x' });
    const rows = await db.researchEvent.findMany({ where: { runId: OTHER } });
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(0);
    await db.researchEvent.deleteMany({ where: { runId: OTHER } });
    await db.researchRun.deleteMany({ where: { id: OTHER } });
  });

  // Parallel stages (trust/grade, sections) record events concurrently: the
  // losers of a seq collision must retry, never throw P2002. Seen live as a
  // failed score stage on prod testnet.
  it('survives concurrent writers with distinct seqs', async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => recordEvent(RUN, { type: 'concurrent', i })),
    );
    const rows = await db.researchEvent.findMany({ where: { runId: RUN }, orderBy: { seq: 'asc' } });
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
});
