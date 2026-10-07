import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the JEV transport only; keep the real JevUnavailable class so the
// decisions layer's `instanceof` park-path is exercised for real.
vi.mock('./client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, decide: vi.fn(), classify: vi.fn(), grade: vi.fn() };
});

const { decide, classify, grade, JevUnavailable } = await import('./client.js');
const { runChoice, runNoul, runGrade } = await import('./decisions.js');
const { db } = await import('../db.js');

const RUN = 'aaaaaaaa-0000-4000-8000-0000000000d1';

async function freshRun() {
  await db.researchDecision.deleteMany({ where: { runId: RUN } });
  await db.researchRun.deleteMany({ where: { id: RUN } });
  await db.researchRun.create({ data: { id: RUN, userId: 'user-1', brief: { topic: 't' }, status: 'running' } });
  return db.researchRun.findUniqueOrThrow({ where: { id: RUN } });
}

beforeEach(async () => { await freshRun(); vi.clearAllMocks(); });
afterEach(async () => { await db.researchDecision.deleteMany({ where: { runId: RUN } }); await db.researchRun.deleteMany({ where: { id: RUN } }); });

describe('runChoice', () => {
  it('records the full decision and returns the pick with its seq', async () => {
    decide.mockResolvedValue({ pick: 'expand', confidence: 0.7, probabilities: { write: 0.3, expand: 0.7 }, model: 'm', usage: null });
    const out = await runChoice(RUN, {
      step: 'search-done',
      state: 's', instructions: 'i',
      options: [{ id: 'write', context: 'a' }, { id: 'expand', context: 'b' }],
    });

    expect(out.pick).toBe('expand');
    expect(Number.isInteger(out.seq)).toBe(true);

    const rows = await db.researchDecision.findMany({ where: { runId: RUN, kind: 'decision' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].step).toBe('search-done');
    expect(rows[0].type).toBe('choice');
    expect(rows[0].output.choice).toBe('expand');
    expect(rows[0].confidence).toBeCloseTo(0.7, 6);

    const run = await db.researchRun.findUniqueOrThrow({ where: { id: RUN } });
    expect(run.status).toBe('running'); // a good decision never parks the run
  });

  it('parks the run (reason jev) and returns null when the decision seat is down', async () => {
    decide.mockRejectedValue(new JevUnavailable('down', { status: 502 }));
    const out = await runChoice(RUN, { step: 'search-done', state: 's', instructions: 'i', options: [{ id: 'a', context: 'a' }, { id: 'b', context: 'b' }] });
    expect(out).toBeNull();
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: RUN } });
    expect(run.status).toBe('paused');
    expect(run.pauseReason).toBe('jev');
  });
});

describe('runNoul', () => {
  it('records a probability judgment', async () => {
    classify.mockResolvedValue({ probability: 0.82, model: 'm', usage: null });
    const out = await runNoul(RUN, { step: 'trust', state: 's', instructions: 'trustworthy?' });
    expect(out.probability).toBe(0.82);
    const row = await db.researchDecision.findFirstOrThrow({ where: { runId: RUN, kind: 'decision', type: 'noul' } });
    expect(row.output.probability).toBeCloseTo(0.82, 6);
  });

  it('parks the run when JEV is unreachable', async () => {
    classify.mockRejectedValue(new JevUnavailable('down'));
    const out = await runNoul(RUN, { step: 'trust', state: 's', instructions: 'trustworthy?' });
    expect(out).toBeNull();
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: RUN } });
    expect(run.pauseReason).toBe('jev');
  });
});

describe('runGrade', () => {
  it('records a score judgment without parking', async () => {
    grade.mockResolvedValue({ score: 2.4, confidence: 0.7, probabilities: { 2: 0.6, 3: 0.4 }, model: 'm', usage: null });
    const out = await runGrade(RUN, { step: 'grade', state: 's', instructions: 'grade it', levels: ['a', 'b', 'c', 'd'] });
    expect(out.score).toBe(2.4);
    const row = await db.researchDecision.findFirstOrThrow({ where: { runId: RUN, type: 'grade' } });
    expect(row.output.score).toBeCloseTo(2.4, 6);
  });

  it('degrades to null without parking when JEV is unreachable (grades rank, never gate)', async () => {
    grade.mockRejectedValue(new JevUnavailable('down'));
    const out = await runGrade(RUN, { step: 'grade', state: 's', instructions: 'grade it', levels: ['a', 'b'] });
    expect(out).toBeNull();
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: RUN } });
    expect(run.pauseReason).not.toBe('jev');
    expect(run.status).toBe('running');
  });
});
