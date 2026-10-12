import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../queue.js', () => ({
  queueMode: () => 'test',
  initQueue: async () => {},
  enqueue: async () => ({ id: 'test-job', mode: 'test' }),
  startWorkers: () => {},
  closeQueue: async () => {},
}));

// Auth is hub-session machinery — not under test. Every request is the owner.
vi.mock('../auth.js', () => ({
  middleware: (req, _res, next) => {
    req.user = { id: 'wallet:0xdiscus0000000000000000000000000000000001', walletAddress: '0xdiscus0000000000000000000000000000000001' };
    next();
  },
  isOwner: () => true,
}));

// No model calls in tests: one canned low-effort answer with usage attached.
vi.mock('../llm/provider.js', () => ({
  isLlmConfigured: () => true,
  chat: async () => ({ text: 'canned follow-up', usage: { totalTokens: 42, costUsd: 0.0001 }, model: 'test-router' }),
}));

const { runs } = await import('./runs.js');
const { db } = await import('../db.js');

const app = express();
app.use(express.json());
app.use('/v1/runs', runs);

const UID = 'wallet:0xdiscus0000000000000000000000000000000001';
let runId;

async function wipe() {
  if (runId) {
    await db.researchReport.deleteMany({ where: { runId } });
    await db.researchEvent.deleteMany({ where: { runId } });
    await db.researchRun.deleteMany({ where: { id: runId } });
    runId = null;
  }
}

async function completeRun(withReport = true) {
  await wipe();
  const run = await db.researchRun.create({
    data: { userId: UID, brief: { topic: 't' }, metadata: {}, status: 'complete' },
  });
  runId = run.id;
  if (withReport) {
    await db.researchReport.create({ data: { runId, version: 1, markdown: '# T\n\nBody with a claim [1].' } });
  }
  return run;
}

beforeEach(wipe);
afterEach(wipe);

describe('POST /v1/runs/:id/discuss', () => {
  it('refuses live runs and report-less runs', async () => {
    const live = await db.researchRun.create({ data: { userId: UID, brief: { topic: 't' }, metadata: {}, status: 'running' } });
    runId = live.id;
    const r1 = await request(app).post(`/v1/runs/${runId}/discuss`).send({ question: 'hi' });
    expect(r1.status).toBe(409);
    await completeRun(false);
    const r2 = await request(app).post(`/v1/runs/${runId}/discuss`).send({ question: 'hi' });
    expect(r2.status).toBe(409);
  });

  it('answers free, tracks the allowance, and never touches the ledger', async () => {
    await completeRun(true);
    const before = await db.budgetLedger.count({ where: { runId } });
    const r = await request(app).post(`/v1/runs/${runId}/discuss`).send({ question: 'what was weakest?' });
    expect(r.status).toBe(200);
    expect(r.body.answer).toBe('canned follow-up');
    expect(r.body.used).toBe(1);
    expect(r.body.remaining).toBe(9);
    expect(r.body.max).toBe(10);
    const after = await db.budgetLedger.count({ where: { runId } });
    expect(after).toBe(before);
    const run = await db.researchRun.findUnique({ where: { id: runId } });
    expect(run.metadata?.discuss?.used).toBe(1);
    expect(run.metadata?.discuss?.log?.[0]?.q).toBe('what was weakest?');
    const ev = await db.researchEvent.findFirst({ where: { runId, type: 'discuss' } });
    expect(ev?.payload?.costUsd).toBe(0.0001);
  });

  it('caps the allowance with 429 and names the way out', async () => {
    await completeRun(true);
    await db.researchRun.update({ where: { id: runId }, data: { metadata: { discuss: { used: 10, tokens: 420, log: [] } } } });
    const r = await request(app).post(`/v1/runs/${runId}/discuss`).send({ question: 'one more?' });
    expect(r.status).toBe(429);
    expect(r.body.remaining).toBe(0);
    expect(String(r.body.error)).toMatch(/reprompt/);
  });

  it('requires a question', async () => {
    await completeRun(true);
    const r = await request(app).post(`/v1/runs/${runId}/discuss`).send({ question: '  ' });
    expect(r.status).toBe(400);
  });
});
