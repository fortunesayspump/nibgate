import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { ACTIVE_STATUSES, assertCanCreateRun, countActiveRuns, maxActiveRuns } from '../src/limits.js';

const USER = 'user-limits';

async function wipe() {
  const runs = await db.researchRun.findMany({ where: { userId: USER }, select: { id: true } });
  const ids = runs.map((r) => r.id);
  if (!ids.length) return;
  await db.researchEvent.deleteMany({ where: { runId: { in: ids } } });
  await db.researchDecision.deleteMany({ where: { runId: { in: ids } } });
  await db.budgetLedger.deleteMany({ where: { runId: { in: ids } } });
  await db.researchRun.deleteMany({ where: { id: { in: ids } } });
}

async function run(status, extra = {}) {
  return db.researchRun.create({
    data: { userId: USER, brief: { topic: 't' }, status, ...extra },
  });
}

beforeEach(wipe);
afterEach(wipe);

describe('per-user run limit', () => {
  it('counts only live runs, never ended or deleted ones', async () => {
    await run('running');
    await run('awaiting');
    await run('complete'); // terminal: does not count
    await run('ended'); // terminal: does not count
    await run('running', { deletedAt: new Date() }); // deleted: does not count
    expect(await countActiveRuns(USER)).toBe(2);
    // Every active status is in the counted set; every terminal one is not.
    expect(ACTIVE_STATUSES).toContain('paused');
    expect(ACTIVE_STATUSES).not.toContain('complete');
  });

  it('refuses a new run once the cap is reached, and allows it after one ends', async () => {
    const cap = maxActiveRuns();
    for (let i = 0; i < cap; i++) await run('running');
    const blocked = await assertCanCreateRun(USER);
    expect(blocked.ok).toBe(false);
    expect(blocked.status).toBe(429);
    expect(blocked.error).toMatch(/live runs/);

    // Ending one frees exactly one slot.
    const one = await db.researchRun.findFirstOrThrow({ where: { userId: USER } });
    await db.researchRun.update({ where: { id: one.id }, data: { status: 'ended' } });
    expect((await assertCanCreateRun(USER)).ok).toBe(true);
  });

  it('allows a user with nothing in flight', async () => {
    const out = await assertCanCreateRun(USER);
    expect(out.ok).toBe(true);
    expect(out.active).toBe(0);
  });

  it('treats an unknown user as empty rather than erroring', async () => {
    expect(await countActiveRuns(null)).toBe(0);
  });
});
