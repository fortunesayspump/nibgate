import { Router } from 'express';
import { db } from '../db.js';
import { publish, subscribe } from '../events.js';
import { requestExecute, requestPlan } from '../worker.js';
import * as auth from '../auth.js';
import { budgetState, raiseCap, settle } from '../money.js';
import { jsonSafe, toDb } from '../units.js';
import { applyAnswer, deriveDescription, deriveTitle, nextQuestion, think, TRASH_TTL_MS } from '../intake.js';

export const runs = Router();

// Every route below is somebody's project. The wallet session is the account,
// so there is no separate Dr. Nib sign-in and no way to reach another
// person's run.
runs.use((req, res, next) => auth.middleware(req, res, next));

async function ownedRun(req, res, { allowDeleted = false } = {}) {
  const run = await db.researchRun.findUnique({ where: { id: req.params.id } });
  if (!run || !auth.isOwner(req.user, run)) {
    res.status(404).json({ error: 'project not found' });
    return null;
  }
  if (run.deletedAt && !allowDeleted) {
    res.status(409).json({ error: 'project is deleted' });
    return null;
  }
  return run;
}

// Everything money-ish a view needs, so the UI never recomputes the ledger.
async function withBudget(run) {
  const { ledger, ...rest } = run;
  return { ...rest, ...(await budgetState(run.id)) };
}

async function answeredKeys(runId) {
  const rows = await db.researchDecision.findMany({ where: { runId, kind: 'question' }, orderBy: { seq: 'asc' } });
  return rows.filter((r) => r.answer != null).map((r) => r.question?.key).filter(Boolean);
}

function createQuestion(runId, seq, q) {
  return db.researchDecision.create({
    data: { runId, seq, kind: 'question', type: q.type, step: 'intake', prompt: q.prompt, question: q },
  });
}

async function purgeExpired() {
  const cutoff = new Date(Date.now() - TRASH_TTL_MS);
  await db.researchRun.deleteMany({ where: { deletedAt: { lt: cutoff } } });
}

// The project belongs to the signed-in wallet from the moment it exists. The
// title and description are a first guess from the prompt and keep sharpening
// as the intake conversation goes on.
runs.post('/', async (req, res) => {
  try {
    const { topic } = req.body || {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) return res.status(400).json({ error: 'topic is required' });
    const run = await db.researchRun.create({
      data: {
        userId: req.user.id,
        walletAddress: req.user.walletAddress,
        title: deriveTitle(topic),
        description: deriveDescription(topic),
        brief: { topic: topic.trim() },
        metadata: {},
        status: 'intake',
      },
    });
    const question = nextQuestion([]);
    if (question) await createQuestion(run.id, 0, question);
    res.status(201).json({ id: run.id, title: run.title, description: run.description, status: run.status, question });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/', async (req, res) => {
  try {
    await purgeExpired();
    const inTrash = req.query.deleted === '1' || req.query.deleted === 'true';
    const rows = await db.researchRun.findMany({
      where: { userId: req.user.id, ...(inTrash ? { deletedAt: { not: null } } : { deletedAt: null }) },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { ledger: true, _count: { select: { sources: true, reports: true } } },
    });
    res.json(jsonSafe({
      runs: rows.map((r) => {
        const { ledger, _count, ...rest } = r;
        const sum = (kind) => ledger.filter((l) => l.kind === kind).reduce((s, l) => s + Number(l.amount), 0);
        return {
          ...rest,
          spent: sum('spend') + sum('fee'),
          balance: sum('deposit') - sum('spend') - sum('fee') - sum('refund'),
          sourceCount: _count.sources,
          reportCount: _count.reports,
        };
      }),
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/:id', async (req, res) => {
  try {
    const run = await ownedRun(req, res, { allowDeleted: true });
    if (!run) return;
    const full = await db.researchRun.findUnique({
      where: { id: run.id },
      include: {
        steps: { orderBy: { createdAt: 'asc' } },
        sources: true,
        claims: true,
        reports: { orderBy: { version: 'desc' }, take: 1 },
        ledger: { orderBy: { createdAt: 'asc' } },
        decisions: { orderBy: { seq: 'asc' } },
      },
    });
    res.json(jsonSafe(await withBudget(full)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Answer the current intake question. Re-answering invalidates the transcript
// after it, and sharpens the project's title/description/metadata.
runs.post('/:id/answers', async (req, res) => {
  try {
    const { seq, answer } = req.body || {};
    const run = await ownedRun(req, res);
    if (!run) return;
    const question = await db.researchDecision.findFirst({ where: { runId: run.id, kind: 'question', seq: Number(seq), step: 'intake' } });
    if (!question) return res.status(404).json({ error: 'question not found' });

    await db.researchDecision.deleteMany({ where: { runId: run.id, kind: 'question', step: 'intake', seq: { gt: Number(seq) } } });
    await db.researchDecision.update({ where: { id: question.id }, data: { answer: answer ?? {}, answeredAt: new Date() } });

    const reasoning = think({ question: question.question, answer });
    const patch = applyAnswer({ run, question: question.question, answer });
    const updated = await db.researchRun.update({
      where: { id: run.id },
      data: { brief: patch.brief, metadata: patch.metadata, title: patch.title, description: patch.description },
    });

    const keys = await answeredKeys(run.id);
    const next = nextQuestion(keys);
    const done = !next;
    if (next) await createQuestion(run.id, Number(seq) + 1, next);
    else await db.researchRun.update({ where: { id: run.id }, data: { status: 'intake-done' } });

    await db.researchDecision.create({
      data: {
        runId: run.id,
        seq: Number(seq),
        kind: 'decision',
        type: done ? 'noul' : 'choice',
        step: 'intake-stop',
        prompt: 'Leave intake?',
        question: { options: { proceed: 'plan now', ask_more: 'ask another question' } },
        answer: { picked: done ? 'proceed' : 'ask_more' },
        output: { decision: done ? 'proceed' : 'ask_more', confidence: done ? 0.9 : 0.8 },
        confidence: done ? 0.9 : 0.8,
      },
    });

    res.json({
      thinking: reasoning,
      done,
      next: next || null,
      project: { id: updated.id, title: updated.title, description: updated.description, status: updated.status, metadata: updated.metadata },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Configure, then plan. This is where a budget first exists: the cap is
// selected here and held before anything is spent.
runs.post('/:id/configure', async (req, res) => {
  try {
    const {
      depth = 'standard', budgetCap, liveWeb = true,
      language = 'en', perspective = 'neutral', formats = ['pdf'],
    } = req.body || {};
    if (!(Number(budgetCap) > 0)) return res.status(400).json({ error: 'budgetCap must be > 0' });
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'intake-done' && run.status !== 'planning') {
      return res.status(409).json({ error: `cannot configure from ${run.status}` });
    }
    const brief = { ...(run.brief || {}), depth, liveWeb, language, perspective, formats };
    await db.researchRun.update({
      where: { id: run.id },
      data: { depth, budgetCap: toDb(budgetCap), brief, status: 'planning', pauseReason: null },
    });
    const holds = await db.budgetLedger.findFirst({ where: { runId: run.id, kind: 'deposit' } });
    if (!holds) await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: toDb(budgetCap) } });
    await requestPlan(run.id);
    res.status(202).json({ id: run.id, status: 'planning' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.post('/:id/approve', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'planned') return res.status(409).json({ error: `cannot approve from ${run.status}` });
    await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
    await requestExecute(run.id);
    res.json({ id: run.id, status: 'running' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Pause is the user's call and says so; a run parked at the cap or by an error
// keeps that reason, because "resume" means something different for each.
runs.post('/:id/pause', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (!['running', 'planning'].includes(run.status)) {
      return res.status(409).json({ error: `cannot pause from ${run.status}` });
    }
    await db.researchRun.update({ where: { id: run.id }, data: { status: 'paused', pauseReason: 'user' } });
    publish(run.id, { type: 'status', status: 'paused', pauseReason: 'user' });
    res.json({ id: run.id, status: 'paused', pauseReason: 'user' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.post('/:id/resume', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'paused') return res.status(409).json({ error: `cannot resume from ${run.status}` });
    const { balance } = await budgetState(run.id);
    if (balance <= 0) return res.status(409).json({ error: 'out of budget Ã¢â‚¬â€ raise the cap or end the run' });
    await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
    publish(run.id, { type: 'status', status: 'running' });
    await requestExecute(run.id);
    res.json({ id: run.id, status: 'running' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// End it: the work already done is kept, the unspent balance comes back now.
runs.post('/:id/end', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (['ended', 'complete'].includes(run.status)) {
      return res.status(409).json({ error: `run is already ${run.status}` });
    }
    await db.researchRun.update({
      where: { id: run.id },
      data: { status: 'ended', endedAt: new Date(), pauseReason: 'user', pendingQuestion: null },
    });
    publish(run.id, { type: 'status', status: 'ended', pauseReason: 'user' });
    const money = await settle(run.id, 'ended');
    res.json({ id: run.id, status: 'ended', ...money });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// The mid-run question card. The run parks, the owner answers, and the run picks
// up from the stage boundary it stopped at.
runs.post('/:id/awaiting/answer', async (req, res) => {
  try {
    const { text } = req.body || {};
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'awaiting') return res.status(409).json({ error: 'the run is not waiting on you' });
    const question = run.pendingQuestion;
    await db.researchDecision.create({
      data: {
        runId: run.id,
        seq: await nextSeq(run.id),
        kind: 'question',
        type: question?.type || 'free',
        step: 'midrun',
        prompt: question?.prompt || null,
        question: question || {},
        answer: { text: text ?? '' },
        answeredAt: new Date(),
      },
    });
    await db.researchRun.update({
      where: { id: run.id },
      data: { status: 'running', pauseReason: null, pendingQuestion: null, brief: { ...(run.brief || {}), guidance: text ?? '' } },
    });
    publish(run.id, { type: 'status', status: 'running', answered: question?.id ?? null });
    await requestExecute(run.id);
    res.json({ id: run.id, status: 'running' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/:id/awaiting', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  res.json({ status: run.status, question: run.pendingQuestion || null });
});

// Guidance typed while the run is moving. Held until the current stage ends.
runs.post('/:id/guidance', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text is required' });
    const run = await ownedRun(req, res);
    if (!run) return;
    if (['ended', 'complete'].includes(run.status)) return res.status(409).json({ error: `run is ${run.status}` });
    await db.researchRun.update({ where: { id: run.id }, data: { pendingGuidance: { text: String(text).trim() } } });
    publish(run.id, { type: 'guidance.queued' });
    res.status(202).json({ id: run.id, pendingGuidance: { text: String(text).trim() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Raise the cap. If the run was parked at the cap, this is what lets it go on.
runs.post('/:id/budget', async (req, res) => {
  try {
    const { amount, txRef } = req.body || {};
    const run = await ownedRun(req, res);
    if (!run) return;
    const result = await raiseCap(run.id, Number(amount), txRef || null);
    if (!result.ok) return res.status(400).json({ error: result.error });
    publish(run.id, { type: 'budget.raised', cap: result.budgetCap, balance: result.balance });
    if (run.status === 'paused' && run.pauseReason === 'cap' && result.balance > 0) {
      await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
      publish(run.id, { type: 'status', status: 'running' });
      await requestExecute(run.id);
    }
    res.json({ id: run.id, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/:id/events', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'hello', status: run.status })}\n\n`);
  subscribe(run.id, res);
});

runs.post('/:id/revise', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    const version = run.versions + 1;
    await db.researchRun.update({ where: { id: run.id }, data: { versions: version, status: 'running', pauseReason: null } });
    publish(run.id, { type: 'status', status: 'running', version });
    await requestExecute(run.id);
    res.status(202).json({ id: run.id, version, status: 'running' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/:id/report', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  const report = await db.researchReport.findFirst({ where: { runId: run.id }, orderBy: { version: 'desc' } });
  if (!report) return res.status(404).json({ error: 'no report yet' });
  res.json(report);
});

async function nextSeq(runId) {
  const last = await db.researchDecision.findFirst({ where: { runId }, orderBy: { seq: 'desc' } });
  return (last?.seq ?? -1) + 1;
}

// Soft delete Ã¢â€ â€™ trash, restorable for seven days. A live or paused run has to be
// ended first: it holds a queue job and prepaid funds.
const DELETABLE = ['ended', 'complete', 'failed', 'intake', 'intake-done'];

runs.delete('/:id', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (!DELETABLE.includes(run.status)) return res.status(409).json({ error: 'end or finish the run before deleting it' });
    const updated = await db.researchRun.update({ where: { id: run.id }, data: { deletedAt: new Date() } });
    res.json({ id: updated.id, deletedAt: updated.deletedAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.post('/:id/restore', async (req, res) => {
  try {
    const run = await ownedRun(req, res, { allowDeleted: true });
    if (!run) return;
    const updated = await db.researchRun.update({ where: { id: run.id }, data: { deletedAt: null } });
    res.json({ id: updated.id, status: updated.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});