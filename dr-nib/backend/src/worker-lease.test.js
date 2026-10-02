import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db.js';
import { findOrphans, requeueOrphans } from './worker.js';

const RUNS = {
  running: 'aaaaaaaa-0000-4000-8000-0000000000c1',
  planning: 'aaaaaaaa-0000-4000-8000-0000000000c2',
  paused: 'aaaaaaaa-0000-4000-8000-0000000000c3',
};
const PAST = new Date(Date.now() - 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

async function makeRun(id, status) {
  return db.researchRun.create({ data: { id, userId: 'user-1', brief: { topic: 't' }, status } });
}

async function makeStep(runId, { status = 'active', leaseUntil = PAST } = {}) {
  return db.researchStep.create({
    data: { runId, kind: 'search', status, attempt: 1, workerId: 'dead-worker', leaseUntil, heartbeatAt: PAST },
  });
}

async function wipe() {
  await db.researchEvent.deleteMany({ where: { runId: { in: Object.values(RUNS) } } });
  await db.researchStep.deleteMany({ where: { runId: { in: Object.values(RUNS) } } });
  await db.researchDecision.deleteMany({ where: { runId: { in: Object.values(RUNS) } } });
  await db.researchRun.deleteMany({ where: { id: { in: Object.values(RUNS) } } });
}

beforeEach(wipe);
afterEach(wipe);

describe('orphan sweep', () => {
  it('requeues a running run and resets its expired step to pending', async () => {
    await makeRun(RUNS.running, 'running');
    await makeStep(RUNS.running, { status: 'active', leaseUntil: PAST });
    const enqueueFn = vi.fn().mockResolvedValue({ id: 'j1' });

    const out = await requeueOrphans({ enqueueFn });

    expect(out.reclaimed).toBe(1);
    expect(out.runs).toEqual([RUNS.running]);
    expect(enqueueFn).toHaveBeenCalledWith('run.execute', { runId: RUNS.running });
    const step = await db.researchStep.findFirstOrThrow({ where: { runId: RUNS.running } });
    expect(step.status).toBe('pending');
    expect(step.workerId).toBeNull();
  });

  it('requeues a planning run onto the plan job', async () => {
    await makeRun(RUNS.planning, 'planning');
    await makeStep(RUNS.planning, { status: 'active', leaseUntil: PAST });
    const enqueueFn = vi.fn().mockResolvedValue({ id: 'j1' });

    await requeueOrphans({ enqueueFn });

    expect(enqueueFn).toHaveBeenCalledWith('run.plan', { runId: RUNS.planning });
  });

  it('leaves a step whose lease is still valid alone', async () => {
    await makeRun(RUNS.running, 'running');
    await makeStep(RUNS.running, { status: 'active', leaseUntil: FUTURE });
    const enqueueFn = vi.fn();

    const out = await requeueOrphans({ enqueueFn });

    expect(out.reclaimed).toBe(0);
    expect(enqueueFn).not.toHaveBeenCalled();
    const step = await db.researchStep.findFirstOrThrow({ where: { runId: RUNS.running } });
    expect(step.status).toBe('active');
  });

  it('resets the orphan but does not resume a paused run', async () => {
    await makeRun(RUNS.paused, 'paused');
    await makeStep(RUNS.paused, { status: 'active', leaseUntil: PAST });
    const enqueueFn = vi.fn().mockResolvedValue({ id: 'j1' });

    const out = await requeueOrphans({ enqueueFn });

    expect(enqueueFn).not.toHaveBeenCalled();
    expect(out.runs).toEqual([]);
    const step = await db.researchStep.findFirstOrThrow({ where: { runId: RUNS.paused } });
    expect(step.status).toBe('pending'); // resumable when the owner resumes
  });

  it('finds only expired active steps', async () => {
    await makeRun(RUNS.running, 'running');
    await makeStep(RUNS.running, { status: 'active', leaseUntil: PAST });
    await makeStep(RUNS.running, { status: 'active', leaseUntil: FUTURE });
    await makeStep(RUNS.running, { status: 'done', leaseUntil: PAST });
    const orphans = await findOrphans();
    const mine = orphans.filter((o) => o.runId === RUNS.running);
    expect(mine).toHaveLength(1);
    expect(mine[0].leaseUntil.getTime()).toBeLessThan(Date.now());
  });
});
