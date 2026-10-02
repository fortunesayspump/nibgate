import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { toDb } from '../src/units.js';
import {
  citationResolutionRate, costPerSupportedClaim, stoppingEfficiency,
  supportedRate, uncitedRate,
} from '../src/evals/metrics.js';
import { evaluateRun } from '../src/evals/run.js';

describe('eval metric math (pure, no I/O)', () => {
  it('flags exactly the claims whose citations resolve nowhere', () => {
    const claims = [
      { text: 'a', passages: [{ url: 'https://a.com/x' }] },
      { text: 'b', passages: [{ url: 'https://ghost.example/y' }] },
    ];
    const out = citationResolutionRate(claims, ['https://a.com/x']);
    expect(out.rate).toBe(0.5);
    expect(out.unresolved).toEqual(['b']);
  });

  it('requires passages to count as cited', () => {
    expect(uncitedRate([{ text: 'a', passages: [] }, { text: 'b', passages: [{ url: 'u' }] }]).rate).toBe(0.5);
    expect(supportedRate([{ status: 'supported' }, { status: 'unknown' }]).rate).toBe(0.5);
  });

  it('refuses to divide by zero supported claims', () => {
    expect(costPerSupportedClaim(1.5, 0).cost).toBe(Infinity);
    expect(costPerSupportedClaim(1.5, 3).cost).toBeCloseTo(0.5, 9);
  });

  it('holds each depth to its step allowance', () => {
    expect(stoppingEfficiency(8, 'quick').within).toBe(true);
    expect(stoppingEfficiency(9, 'quick').within).toBe(false);
    expect(stoppingEfficiency(100, 'mystery').within).toBe(false);
  });
});

const RUN = 'aaaaaaaa-0000-4000-8000-0000000000e1';

async function wipe() {
  await db.researchEvent.deleteMany({ where: { runId: RUN } });
  await db.researchClaim.deleteMany({ where: { runId: RUN } });
  await db.researchSource.deleteMany({ where: { runId: RUN } });
  await db.researchStep.deleteMany({ where: { runId: RUN } });
  await db.budgetLedger.deleteMany({ where: { runId: RUN } });
  await db.researchReport.deleteMany({ where: { runId: RUN } });
  await db.researchDecision.deleteMany({ where: { runId: RUN } });
  await db.researchRun.deleteMany({ where: { id: RUN } });
}

beforeEach(wipe);
afterEach(wipe);

describe('eval gates on a finished run', () => {
  it('passes a clean run and names every failing bar on a dirty one', async () => {
    await db.researchRun.create({
      data: { id: RUN, userId: 'user-1', brief: { topic: 't' }, status: 'complete', depth: 'quick', budgetCap: toDb(5) },
    });
    await db.budgetLedger.createMany({
      data: [
        { runId: RUN, kind: 'deposit', amount: toDb(5) },
        { runId: RUN, kind: 'spend', amount: toDb(0.2) },
        { runId: RUN, kind: 'fee', amount: toDb(0.002) },
      ],
    });
    await db.researchSource.createMany({
      data: [
        { runId: RUN, url: 'https://a.com/1', title: 'A', domain: 'a.com', relevance: 0.9, trust: 0.8 },
        { runId: RUN, url: 'https://b.com/2', title: 'B', domain: 'b.com', relevance: 0.7, trust: 0.6 },
      ],
    });
    await db.researchClaim.createMany({
      data: [
        { runId: RUN, text: 'supported claim', status: 'supported', passages: [{ url: 'https://a.com/1' }] },
        { runId: RUN, text: 'ghost claim', status: 'unknown', passages: [{ url: 'https://ghost.example/z' }] },
      ],
    });

    const dirty = await evaluateRun(RUN);
    expect(dirty.ok).toBe(false);
    // Resolution 1/2, supported 1/2, uncited 0, cost 0.202/1 — the failures
    // name the bars, so a red build tells you what broke.
    expect(dirty.failures.some((f) => f.startsWith('citation-resolution'))).toBe(true);
    expect(dirty.metrics.resolution.unresolved).toEqual(['ghost claim']);

    // Fix the ghost citation: the same run now passes every gate.
    await db.researchClaim.updateMany({
      where: { runId: RUN, text: 'ghost claim' },
      data: { status: 'supported', passages: [{ url: 'https://b.com/2' }] },
    });
    const clean = await evaluateRun(RUN);
    expect(clean.failures).toEqual([]);
    expect(clean.ok).toBe(true);
    expect(clean.metrics.supported.rate).toBe(1);
  });
});
