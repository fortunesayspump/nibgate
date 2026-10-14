import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { FEE_BPS, budgetState, draw, raiseCap, settle } from '../src/money.js';
import { toDb } from '../src/units.js';

const RUN = 'aaaaaaaa-0000-4000-8000-000000000001';

async function freshRun({ status = 'running', budgetCap = 1 } = {}) {
  await db.researchRun.deleteMany({ where: { id: RUN } });
  return db.researchRun.create({
    data: { id: RUN, userId: 'user-1', brief: {}, status, budgetCap: toDb(budgetCap) },
  });
}

const hold = (amount) => db.budgetLedger.create({ data: { runId: RUN, kind: 'deposit', amount: toDb(amount) } });

describe('budget ledger', () => {
  beforeEach(async () => {
    await freshRun({ budgetCap: 0 });
    await hold(5);
    await db.researchRun.update({ where: { id: RUN }, data: { budgetCap: toDb(5) } });
  });

  it('reports a held balance before anything is spent', async () => {
    const state = await budgetState(RUN);
    expect(state.deposited).toBe(5);
    expect(state.used).toBe(0);
    expect(state.balance).toBe(5);
  });

  it('accrues 1% operator-side without reducing the payer balance', async () => {
    const result = await draw(RUN, 1);
    expect(result.ok).toBe(true);
    expect(FEE_BPS).toBe(100);
    expect(result.spend).toBe(1);
    expect(result.fee).toBe(0.01);
    expect(result.used).toBe(1);
    expect(result.balance).toBeCloseTo(4, 9);
  });

  it('refuses a draw that would pass the cap and charges nothing for it', async () => {
    const before = await budgetState(RUN);
    const result = await draw(RUN, 5.01);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('cap');
    const after = await budgetState(RUN);
    expect(after.used).toBe(before.used);
    expect(after.balance).toBe(before.balance);
  });

  it('never lets the balance go negative, however hard it is pushed', async () => {
    for (let i = 0; i < 40; i++) {
      const result = await draw(RUN, 0.37);
      if (!result.ok) break;
    }
    const state = await budgetState(RUN);
    expect(state.used).toBeLessThanOrEqual(5);
    expect(state.balance).toBeGreaterThanOrEqual(0);
  });

  it('holds an exact balance rather than accumulating float drift', async () => {
    for (let i = 0; i < 10; i++) await draw(RUN, 0.1);
    const state = await budgetState(RUN);
    // 10 x 0.10 spend + 10 x 0.001 fee == 1.01 exactly. Floats would drift
    // (0.1 is unrepresentable in binary); Decimal does not.
    expect(state.spend).toBe(1);
    expect(state.fee).toBe(0.01);
    expect(state.used).toBe(1);
  });

  it('does not bill a checkpointed stage twice after a replay',async()=>{
    await draw(RUN,0.5,'spend','stage:search:1');
    const replay=await draw(RUN,0.5,'spend','stage:search:1');
    expect(replay.alreadyCharged).toBe(true);
    expect((await budgetState(RUN)).spend).toBe(0.5);
  });
});

describe('raising a budget', () => {
  beforeEach(async () => {
    await freshRun({ status: 'running', budgetCap: 5 });
    await hold(5);
  });

  it('refuses to lower a cap once the run is configured', async () => {
    const result = await raiseCap(RUN, 2);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/only be raised/i);
  });

  it('refuses a nonsensical amount', async () => {
    expect((await raiseCap(RUN, 0)).ok).toBe(false);
    expect((await raiseCap(RUN, -1)).ok).toBe(false);
  });

  it('raises the cap and holds the difference', async () => {
    await draw(RUN, 1);
    const result = await raiseCap(RUN, 8);
    expect(result.ok).toBe(true);
    expect(result.budgetCap).toBe(8);
    expect(result.deposited).toBe(8);
    expect(result.balance).toBeCloseTo(7, 9);
  });

  it('cannot create an unfunded escrow top-up through an alternate route',async()=>{
    await db.researchRun.update({where:{id:RUN},data:{metadata:{escrow:{jobId:'42'}}}});
    expect((await raiseCap(RUN,8)).ok).toBe(false);
    expect((await budgetState(RUN)).deposited).toBe(5);
  });
});

describe('settling', () => {
  beforeEach(async () => {
    await freshRun({ status: 'running', budgetCap: 5 });
    await hold(5);
    await draw(RUN, 1.25);
  });

  it('returns the unspent remainder immediately and zeroes the balance', async () => {
    const result = await settle(RUN, 'ended');
    // 5 deposited − 1.25 spent = 3.75 refunded; the fee is operator-side.
    expect(result.refunded).toBeCloseTo(3.75, 4);
    expect(result.balance).toBe(0);
  });

  it('never refunds the same money twice', async () => {
    await settle(RUN, 'ended');
    const again = await settle(RUN, 'ended');
    expect(again.refunded).toBe(0);
    const state = await budgetState(RUN);
    expect(state.balance).toBe(0);
    expect(state.refunded).toBeCloseTo(state.deposited - state.used, 6);
  });

  it('cannot spend or raise a budget after its refund has left',async()=>{
    await settle(RUN,'ended');
    expect((await draw(RUN,0.1)).reason).toBe('settled');
    expect((await raiseCap(RUN,8)).ok).toBe(false);
    expect((await budgetState(RUN)).balance).toBe(0);
  });

  it('records in-flight costs before refunding',async()=>{
    const step=await db.researchStep.create({data:{runId:RUN,kind:'fetch',status:'active'}});
    expect((await settle(RUN,'ended')).pending).toBe(true);
    expect((await draw(RUN,0.25)).ok).toBe(true);
    await db.researchStep.update({where:{id:step.id},data:{status:'done'}});
    expect((await settle(RUN,'ended')).refunded).toBe(3.5);
  });

  it('serializes simultaneous draws and refunds without overspending',async()=>{
    const results=await Promise.all([draw(RUN,3),draw(RUN,3)]);
    expect(results.filter(r=>r.ok)).toHaveLength(1);
    await Promise.all([settle(RUN,'ended'),settle(RUN,'ended')]);
    const state=await budgetState(RUN);
    expect(state.used).toBe(4.25);
    expect(state.refunded).toBe(0.75);
    expect(state.balance).toBe(0);
  });
});
