import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/queue.js', () => ({
  queueMode: () => 'test',
  initQueue: async () => {},
  enqueue: async () => ({ id: 'test-job', mode: 'test' }),
  startWorkers: () => {},
}));

const { runs } = await import('../src/routes/runs.js');
const { budgets } = await import('../src/routes/budgets.js');
const { exports: exportsRouter } = await import('../src/routes/exports.js');
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
app.use('/v1/budgets', budgets);
app.use('/v1', exportsRouter);

const api = () => request(app);

async function reset() {
  await db.researchEvent.deleteMany({ where: { runId: { in: await ids() } } });
  await db.researchReport.deleteMany({ where: { runId: { in: await ids() } } });
  await db.researchExport.deleteMany({ where: { runId: { in: await ids() } } });
  await db.researchDecision.deleteMany({ where: { runId: { in: await ids() } } });
  await db.budgetLedger.deleteMany({ where: { runId: { in: await ids() } } });
  await db.researchStep.deleteMany({ where: { runId: { in: await ids() } } });
  await db.researchSource.deleteMany({ where: { runId: { in: await ids() } } });
  await db.researchClaim.deleteMany({ where: { runId: { in: await ids() } } });
  await db.researchRun.deleteMany({ where: { userId: { in: [ALICE.id, MALLORY.id] } } });
  // Idempotency rows outlive runs: without this, a key from an earlier test
  // (or an earlier run of the suite) would replay a stale response.
  await db.idempotencyKey.deleteMany({ where: { userId: { in: [ALICE.id, MALLORY.id] } } });
}

async function ids() {
  const rows = await db.researchRun.findMany({ where: { userId: { in: [ALICE.id, MALLORY.id] } }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function makeRun(over = {}) {
  const cap = over.budgetCap ?? 5;
  const run = await db.researchRun.create({
    data: {
      userId: ALICE.id, walletAddress: ALICE.walletAddress, title: 'Test run',
      brief: { topic: 'testing' }, status: 'intake', budgetCap: toDb(cap), ...over,
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

describe('report length', () => {
  it('resolves presets and exact word counts, clamping the absurd', async () => {
    const run = await makeRun({ status: 'intake-done', budgetCap: 0 });
    const custom = await api().post(`/v1/runs/${run.id}/configure`).send({ budgetCap: 5, length: 'standard', lengthWords: 7500 });
    expect(custom.status).toBe(202);
    expect(custom.body.length.preset).toBe('custom');
    expect(custom.body.length.words).toBe(7500);
    expect(custom.body.length.sections).toBe(8); // ~1 section per 1000 words
    const after = await api().get(`/v1/runs/${run.id}`);
    expect(after.body.brief.lengthWords).toBe(7500);
  });

  it('clamps tiny and huge counts instead of failing', async () => {
    const run = await makeRun({ status: 'intake-done', budgetCap: 0 });
    const res = await api().post(`/v1/runs/${run.id}/configure`).send({ budgetCap: 5, lengthWords: 5 });
    expect(res.status).toBe(202);
    expect(res.body.length.words).toBe(300);
    expect(res.body.length.clamped).toBe(true);
  });

  it('defaults to standard when nothing is said', async () => {
    const run = await makeRun({ status: 'intake-done', budgetCap: 0 });
    const res = await api().post(`/v1/runs/${run.id}/configure`).send({ budgetCap: 5 });
    expect(res.body.length.preset).toBe('standard');
    expect(res.body.length.words).toBe(4000);
  });
});

describe('plan editing', () => {
  it('re-prices live when the user changes the questions', async () => {
    const run = await makeRun({ status: 'intake-done', budgetCap: 0 });
    await api().post(`/v1/runs/${run.id}/configure`).send({ budgetCap: 5 });
    const before = await api().get(`/v1/runs/${run.id}`);
    const edited = await api().patch(`/v1/runs/${run.id}/plan`).send({
      sub_questions: ['one', 'two', 'three', 'four', 'five', 'six'],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.plan.sub_questions).toHaveLength(6);
    expect(edited.body.plan.estimate).toBeGreaterThan(before.body.plan?.estimate ?? 0);
    expect(edited.body.status).toBe('planned');
  });

  it('refuses edits mid-run and empty question lists', async () => {
    const run = await makeRun({ status: 'running' });
    expect((await api().patch(`/v1/runs/${run.id}/plan`).send({ sub_questions: ['q'] })).status).toBe(409);
    const planned = await makeRun({ status: 'planned' });
    expect((await api().patch(`/v1/runs/${planned.id}/plan`).send({ sub_questions: [] })).status).toBe(400);
    expect((await api().patch(`/v1/runs/${planned.id}/plan`).send({})).status).toBe(400);
  });
});

describe('approving against the estimate', () => {
  it('refuses to start a run whose balance cannot cover its own plan', async () => {
    const run = await makeRun({ status: 'intake-done', budgetCap: 0 });
    await api().post(`/v1/runs/${run.id}/configure`).send({ budgetCap: 5, depth: 'deep', lengthWords: 50000 });
    // A planned run carries its priced plan; drain the balance under it.
    await db.researchRun.update({
      where: { id: run.id },
      data: { status: 'planned', plan: { sub_questions: ['q'], estimate: 5.5 } },
    });
    // Drain the balance below the (large) estimate without touching the cap.
    await db.budgetLedger.createMany({
      data: [
        { runId: run.id, kind: 'spend', amount: toDb(4.9) },
        { runId: run.id, kind: 'fee', amount: toDb(0.049) },
      ],
    });
    const res = await api().post(`/v1/runs/${run.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/below the plan estimate/);
  });
});

describe('intake answers', () => {
  it('walks the question bank, thinking visibly, until the brief is whole', async () => {
    const created = await api().post('/v1/runs').send({ topic: 'should I depend on x402' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    // Four questions in the bank; each answer returns thinking + the next one.
    for (let seq = 0; seq < 4; seq++) {
      const res = await api().post(`/v1/runs/${id}/answers`).send({ seq, answer: { optionIds: [], text: `answer ${seq}` } });
      expect(res.status).toBe(200);
      expect(typeof res.body.thinking).toBe('string');
      expect(res.body.thinking.length).toBeGreaterThan(0);
      // Offline the thinking is deterministic and says so; with a model it
      // would be the model's own words.
      expect(res.body.thinkingSource).toBe('fallback');
      if (seq < 3) {
        expect(res.body.done).toBe(false);
        expect(res.body.next).toBeTruthy();
      } else {
        expect(res.body.done).toBe(true);
        expect(res.body.next).toBeNull();
      }
    }
    const run = await db.researchRun.findUniqueOrThrow({ where: { id } });
    expect(run.status).toBe('intake-done');
    const questions = await db.researchDecision.findMany({ where: { runId: id, kind: 'question' } });
    expect(questions).toHaveLength(4);
    expect(questions.every((q) => q.answer != null)).toBe(true);
  });

  it('rejects an answer to a question that does not exist', async () => {
    const run = await makeRun();
    expect((await api().post(`/v1/runs/${run.id}/answers`).send({ seq: 99, answer: { text: 'hi' } })).status).toBe(404);
  });
});

describe('revise and report', () => {
  it('revising bumps the version and reruns without touching history', async () => {
    const run = await makeRun({ status: 'complete' });
    await db.researchReport.create({ data: { runId: run.id, version: 1, markdown: '# v1', citations: [] } });
    const res = await api().post(`/v1/runs/${run.id}/revise`);
    expect(res.status).toBe(202);
    expect(res.body.version).toBe(2);
    const after = await api().get(`/v1/runs/${run.id}`);
    expect(after.body.status).toBe('running');
    const reports = await db.researchReport.findMany({ where: { runId: run.id } });
    expect(reports).toHaveLength(1); // v1 kept; v2 arrives from the run
  });

  it('reads the latest report, 404 when none exists', async () => {
    const run = await makeRun({ status: 'running' });
    expect((await api().get(`/v1/runs/${run.id}/report`)).status).toBe(404);
    await db.researchReport.create({ data: { runId: run.id, version: 1, markdown: '# hello', citations: [] } });
    const res = await api().get(`/v1/runs/${run.id}/report`);
    expect(res.status).toBe(200);
    expect(res.body.markdown).toBe('# hello');
  });
});

describe('budgets', () => {
  it('reads the balance and the full ledger from one place', async () => {
    const run = await makeRun({ status: 'running' });
    const res = await api().get(`/v1/budgets/${run.id}`);
    expect(res.status).toBe(200);
    expect(res.body.budgetCap).toBe(5);
    expect(res.body.balance).toBe(5);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].kind).toBe('deposit');
  });

  it('tops up by raising, and refuses a top-down', async () => {
    const run = await makeRun({ status: 'running' });
    const up = await api().post(`/v1/budgets/${run.id}/topup`).send({ amount: 8 });
    expect(up.status).toBe(201);
    expect(up.body.budgetCap).toBe(8);
    expect(up.body.balance).toBe(8);
    expect((await api().post(`/v1/budgets/${run.id}/topup`).send({ amount: 2 })).status).toBe(400);
  });

  it('replays a retried top-up instead of raising twice', async () => {
    const run = await makeRun({ status: 'running' });
    const headers = { 'Idempotency-Key': 'topup-1' };
    const first = await api().post(`/v1/budgets/${run.id}/topup`).set(headers).send({ amount: 8 });
    expect(first.status).toBe(201);
    const second = await api().post(`/v1/budgets/${run.id}/topup`).set(headers).send({ amount: 8 });
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    const state = await db.budgetLedger.findMany({ where: { runId: run.id, kind: 'deposit' } });
    // One deposit from the fixture plus one raise — not two raises.
    expect(state).toHaveLength(2);
    const third = await api().post(`/v1/budgets/${run.id}/topup`).set({ 'Idempotency-Key': 'topup-2' }).send({ amount: 9 });
    expect(third.status).toBe(201);
    expect(third.body.budgetCap).toBe(9);
  });

  it('hides another wallet’s money entirely', async () => {
    const run = await makeRun({ status: 'running' });
    who = MALLORY;
    expect((await api().get(`/v1/budgets/${run.id}`)).status).toBe(404);
    expect((await api().post(`/v1/budgets/${run.id}/topup`).send({ amount: 9 })).status).toBe(404);
  });
});

describe('exports', () => {
  it('renders markdown, JSON packets, and BibTeX from finished work', async () => {
    const run = await makeRun({ status: 'complete' });
    await db.researchReport.create({ data: { runId: run.id, version: 1, markdown: '# Title\n\nBody.', citations: [] } });
    await db.researchSource.create({
      data: { runId: run.id, url: 'https://a.com/p', title: 'Paper', domain: 'a.com', relevance: 0.9, trust: 0.8 },
    });

    const md = await api().post(`/v1/runs/${run.id}/exports`).send({ format: 'md' });
    expect(md.status).toBe(200);
    expect(md.body.status).toBe('done');
    expect(md.body.content).toContain('# Title');
    expect(md.body.filename).toMatch(/\.md$/);

    const json = await api().post(`/v1/runs/${run.id}/exports`).send({ format: 'json' });
    expect(json.status).toBe(200);
    const packet = JSON.parse(json.body.content);
    expect(packet.markdown).toContain('# Title');
    expect(packet.sources).toHaveLength(1);
    expect(packet.ledger).toBeTruthy();

    const bib = await api().post(`/v1/runs/${run.id}/exports`).send({ format: 'bibtex' });
    expect(bib.status).toBe(200);
    expect(bib.body.content).toMatch(/@misc\{/);
    expect(bib.body.content).toContain('https://a.com/p');

    const fetched = await api().get(`/v1/runs/${run.id}/exports/${md.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.format).toBe('md');
  });

  it('says plainly which formats have no renderer yet, and refuses without a report', async () => {
    const run = await makeRun({ status: 'complete' });
    expect((await api().post(`/v1/runs/${run.id}/exports`).send({ format: 'pdf' })).status).toBe(501);
    expect((await api().post(`/v1/runs/${run.id}/exports`).send({ format: 'md' })).status).toBe(409);
    expect((await api().post(`/v1/runs/${run.id}/exports`).send({ format: 'exe' })).status).toBe(400);
    expect((await api().get(`/v1/runs/${run.id}/exports/nope`)).status).toBe(404);
  });

  it('hides another wallet’s exports', async () => {
    const run = await makeRun({ status: 'complete' });
    who = MALLORY;
    expect((await api().post(`/v1/runs/${run.id}/exports`).send({ format: 'md' })).status).toBe(404);
  });
});
