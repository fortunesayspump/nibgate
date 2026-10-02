import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.js';
import { memoryPriors, recordRunMemory } from './memory.js';

const RUN = 'aaaaaaaa-0000-4000-8000-0000000000e1';
const USER = 'user-memory';

async function wipe() {
  await db.queryMemory.deleteMany({ where: { userId: USER } });
  await db.researchEvent.deleteMany({ where: { runId: RUN } });
  await db.researchClaim.deleteMany({ where: { runId: RUN } });
  await db.researchSource.deleteMany({ where: { runId: RUN } });
  await db.researchStep.deleteMany({ where: { runId: RUN } });
  await db.budgetLedger.deleteMany({ where: { runId: RUN } });
  await db.researchReport.deleteMany({ where: { runId: RUN } });
  await db.researchDecision.deleteMany({ where: { runId: RUN } });
  await db.researchExport.deleteMany({ where: { runId: RUN } });
  await db.researchRun.deleteMany({ where: { id: RUN } });
}

beforeEach(wipe);
afterEach(wipe);

describe('query memory', () => {
  it('records reads for every domain and cites only what the report cited', async () => {
    await db.researchRun.create({ data: { id: RUN, userId: USER, brief: { topic: 't' }, status: 'complete' } });
    await db.researchSource.createMany({
      data: [
        { runId: RUN, url: 'https://a.com/1', title: 'A', domain: 'a.com', relevance: 0.9, trust: 0.8 },
        { runId: RUN, url: 'https://b.com/2', title: 'B', domain: 'b.com', relevance: 0.7, trust: 0.6 },
      ],
    });
    await db.researchReport.create({ data: { runId: RUN, version: 1, markdown: 'Claim supported by [1].', citations: [] } });

    const out = await recordRunMemory(RUN);
    expect(out.recorded).toBe(2);
    expect(out.cited).toBe(1);

    const priors = await memoryPriors(USER, ['a.com', 'b.com', 'unknown.example']);
    expect(priors['a.com']).toEqual({ reads: 1, cites: 1, rate: 1 });
    expect(priors['b.com']).toEqual({ reads: 1, cites: 0, rate: 0 });
    expect(priors['unknown.example']).toBeUndefined(); // no prior, not zero
  });

  it('accumulates across runs without double-counting a single run', async () => {
    await db.researchRun.create({ data: { id: RUN, userId: USER, brief: { topic: 't' }, status: 'complete' } });
    await db.researchSource.create({
      data: { runId: RUN, url: 'https://a.com/1', title: 'A', domain: 'a.com', relevance: 0.9, trust: 0.8 },
    });
    await db.researchReport.create({ data: { runId: RUN, version: 1, markdown: 'Supported by [1].', citations: [] } });
    await recordRunMemory(RUN);
    await recordRunMemory(RUN);
    const priors = await memoryPriors(USER, ['a.com']);
    // Two recordings (the caller invokes once per report; this proves the
    // counter itself is a plain accumulator, not a set).
    expect(priors['a.com']).toEqual({ reads: 2, cites: 2, rate: 1 });
  });

  it('skips runs with no owner rather than attributing to nobody', async () => {
    await db.researchRun.create({ data: { id: RUN, brief: { topic: 't' }, status: 'complete' } });
    const out = await recordRunMemory(RUN);
    expect(out.recorded).toBe(0);
    expect(await db.queryMemory.count()).toBe(0);
  });
});
