import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The routes enqueue work. In tests the queue is a no-op so a route test never
// has a pipeline mutating its run out from under it — the worker's own
// behaviour is exercised in worker.test.js.
vi.mock('../src/queue.js', () => ({
  queueMode: () => 'test',
  initQueue: async () => {},
  enqueue: async () => ({ id: 'test-job', mode: 'test' }),
  startWorkers: () => {},
}));

const { runs } = await import('../src/routes/runs.js');
const auth = await import('../src/auth.js');
const { db } = await import('../src/db.js');
const { toDb } = await import('../src/units.js');

const ALICE = { id: 'user-alice', walletAddress: '0xalice' };
const MALLORY = { id: 'user-mallory', walletAddress: '0xmallory' };

let who = ALICE;
const realAuth = auth.middleware;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/v1/runs', runs);

const api = () => request(app);

async function reset() {
  await db.researchRun.deleteMany({ where: { userId: { in: [ALICE.id, MALLORY.id] } } });
}

async function makeRun(over = {}) {
  // A fresh run holds exactly its cap — nothing more. Depositing a stray 5
  // against a cap of 0 would model a state no real code path can produce
  // (configure holds the cap it sets; raiseCap holds only the difference),
  // and every balance assertion below depends on deposited == cap.
  const cap = over.budgetCap ?? 5;
  const run = await db.researchRun.create({
    data: {
      userId: ALICE.id,
      walletAddress: ALICE.walletAddress,
      title: 'Test run',
      brief: { topic: 'testing' },
      status: 'intake',
      budgetCap: toDb(cap),
      ...over,
    },
  });
  if (cap > 0) {
    await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: toDb(cap) } });
  }
  return run;
}

beforeAll(() => {
  auth.__setAuthMiddleware((req, _res, next) => { req.user = who; next(); });
});

afterAll(() => {
  auth.__setAuthMiddleware(realAuth);
});

beforeEach(async () => {
  who = ALICE;
  await reset();
});

describe('ownership', () => {
  it('refuses everything when nobody is signed in', async () => {
    auth.__setAuthMiddleware(realAuth);
    try {
      expect((await api().get('/v1/runs')).status).toBe(401);
      expect((await api().post('/v1/runs').send({ topic: 'hi' })).status).toBe(401);
    } finally {
      auth.__setAuthMiddleware((req, _res, next) => { req.user = who; next(); });
    }
  });

  it('gives a new project to the signed-in wallet', async () => {
    const created = await api().post('/v1/runs').send({ topic: 'how escrow works' });
    expect(created.status).toBe(201);
    const full = await api().get(`/v1/runs/${created.body.id}`);
    expect(full.status).toBe(200);
    expect(full.body.userId).toBe(ALICE.id);
    expect(full.body.walletAddress).toBe(ALICE.walletAddress);
  });

  it('hides another wallet\'s project entirely', async () => {
    const run = await makeRun();
    who = MALLORY;
    expect((await api().get(`/v1/runs/${run.id}`)).status).toBe(404);
    expect((await api().post(`/v1/runs/${run.id}/end`)).status).toBe(404);
    expect((await api().post(`/v1/runs/${run.id}/pause`)).status).toBe(404);
    expect((await api().delete(`/v1/runs/${run.id}`)).status).toBe(404);
    expect((await api().get('/v1/runs')).body.runs).toHaveLength(0);
  });
});

describe('configuring and starting', () => {
  it('holds the cap and plans', async () => {
    const run = await makeRun({ status: 'intake-done', budgetCap: 0 });
    const res = await api().post(`/v1/runs/${run.id}/configure`).send({ budgetCap: 2.5, depth: 'deep' });
    expect(res.status).toBe(202);
    const after = await api().get(`/v1/runs/${run.id}`);
    expect(after.body.budgetCap).toBe(2.5);
    expect(after.body.balance).toBe(2.5);
  });

  it('refuses a cap of zero', async () => {
    const run = await makeRun({ status: 'intake-done' });
    expect((await api().post(`/v1/runs/${run.id}/configure`).send({ budgetCap: 0 })).status).toBe(400);
  });

  it('will not configure a run that is already going', async () => {
    const run = await makeRun({ status: 'running' });
    expect((await api().post(`/v1/runs/${run.id}/configure`).send({ budgetCap: 2 })).status).toBe(409);
  });

  it('only approves a plan that exists', async () => {
    const run = await makeRun({ status: 'intake' });
    expect((await api().post(`/v1/runs/${run.id}/approve`)).status).toBe(409);
  });
});

describe('pausing', () => {
  it('records that the user paused it, and resumes cleanly', async () => {
    const run = await makeRun({ status: 'running' });
    const paused = await api().post(`/v1/runs/${run.id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.pauseReason).toBe('user');

    const resumed = await api().post(`/v1/runs/${run.id}/resume`);
    expect(resumed.status).toBe(200);
    const after = await api().get(`/v1/runs/${run.id}`);
    expect(after.body.status).toBe('running');
    expect(after.body.pauseReason).toBeNull();
  });

  it('will not resume a run with nothing left in it', async () => {
    const run = await makeRun({ status: 'paused', pauseReason: 'cap', budgetCap: 0 });
    const res = await api().post(`/v1/runs/${run.id}/resume`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/out of budget/i);
  });

  it('starts again as soon as a cap pause is funded', async () => {
    const run = await makeRun({ status: 'paused', pauseReason: 'cap', budgetCap: 0 });
    const res = await api().post(`/v1/runs/${run.id}/budget`).send({ amount: 3 });
    expect(res.status).toBe(200);
    const after = await api().get(`/v1/runs/${run.id}`);
    expect(after.body.status).toBe('running');
    expect(after.body.pauseReason).toBeNull();
    expect(after.body.balance).toBe(3);
  });
});

describe('ending a run', () => {
  it('keeps the work, hands back the rest, and settles immediately', async () => {
    const run = await makeRun({ status: 'running' });
    await db.budgetLedger.create({ data: { runId: run.id, kind: 'spend', amount: toDb(1) } });
    await db.budgetLedger.create({ data: { runId: run.id, kind: 'fee', amount: toDb(0.01) } });

    const ended = await api().post(`/v1/runs/${run.id}/end`);
    expect(ended.status).toBe(200);
    expect(ended.body.status).toBe('ended');
    expect(ended.body.refunded).toBeCloseTo(3.99, 6);
    expect(ended.body.balance).toBe(0);

    const after = await api().get(`/v1/runs/${run.id}`);
    expect(after.body.endedAt).toBeTruthy();
    expect(after.body.settledAt).toBeTruthy();
    expect(after.body.deletedAt).toBeNull();
  });

  it('will not end the same run twice', async () => {
    const run = await makeRun({ status: 'ended' });
    expect((await api().post(`/v1/runs/${run.id}/end`)).status).toBe(409);
  });
});

describe('the run asking the user something', () => {
  it('parks on the question and picks up from the answer', async () => {
    const question = { id: 'scope-check', type: 'free', prompt: 'Which branch?' };
    const run = await makeRun({ status: 'awaiting', pauseReason: 'awaiting', pendingQuestion: question });

    const waiting = await api().get(`/v1/runs/${run.id}/awaiting`);
    expect(waiting.body.question.prompt).toBe('Which branch?');

    const answered = await api().post(`/v1/runs/${run.id}/awaiting/answer`).send({ text: 'the cheap branch' });
    expect(answered.status).toBe(200);

    const after = await api().get(`/v1/runs/${run.id}`);
    expect(after.body.status).toBe('running');
    expect(after.body.pendingQuestion).toBeNull();
    expect(after.body.pauseReason).toBeNull();

    const decisions = await db.researchDecision.findMany({ where: { runId: run.id, step: 'midrun' } });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].answer).toEqual({ text: 'the cheap branch' });
  });

  it('will not accept an answer when nothing is being asked', async () => {
    const run = await makeRun({ status: 'running' });
    expect((await api().post(`/v1/runs/${run.id}/awaiting/answer`).send({ text: 'hi' })).status).toBe(409);
  });
});

describe('guidance typed mid-run', () => {
  it('is held rather than pushed into the stage that is already running', async () => {
    const run = await makeRun({ status: 'running' });
    const res = await api().post(`/v1/runs/${run.id}/guidance`).send({ text: 'ignore the vendor blogs' });
    expect(res.status).toBe(202);
    const after = await api().get(`/v1/runs/${run.id}`);
    expect(after.body.pendingGuidance).toEqual({ text: 'ignore the vendor blogs' });
  });

  it('refuses empty guidance and guidance for a run that is over', async () => {
    const run = await makeRun({ status: 'running' });
    expect((await api().post(`/v1/runs/${run.id}/guidance`).send({ text: '  ' })).status).toBe(400);
    await db.researchRun.update({ where: { id: run.id }, data: { status: 'complete' } });
    expect((await api().post(`/v1/runs/${run.id}/guidance`).send({ text: 'too late' })).status).toBe(409);
  });
});

describe('deleting', () => {
  it('refuses while a run is live or paused, and allows it once ended', async () => {
    const live = await makeRun({ status: 'running' });
    expect((await api().delete(`/v1/runs/${live.id}`)).status).toBe(409);

    const paused = await makeRun({ status: 'paused', pauseReason: 'user' });
    expect((await api().delete(`/v1/runs/${paused.id}`)).status).toBe(409);

    const ended = await makeRun({ status: 'ended' });
    expect((await api().delete(`/v1/runs/${ended.id}`)).status).toBe(200);
  });

  it('keeps a deleted project restorable', async () => {
    const run = await makeRun({ status: 'ended' });
    await api().delete(`/v1/runs/${run.id}`);
    expect((await api().get('/v1/runs')).body.runs).toHaveLength(0);
    expect((await api().get('/v1/runs?deleted=1')).body.runs).toHaveLength(1);
    expect((await api().post(`/v1/runs/${run.id}/restore`)).status).toBe(200);
    expect((await api().get('/v1/runs')).body.runs).toHaveLength(1);
  });
});