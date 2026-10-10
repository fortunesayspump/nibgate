import { Router } from 'express';
import { db } from '../db.js';
import { subscribe } from '../events.js';
import { recordEvent, replayEvents } from '../eventlog.js';
import { idempotency } from '../idempotency.js';
import { requestExecute, requestPlan, estimatePlanCost } from '../worker.js';
import * as auth from '../auth.js';
import { budgetState, raiseCap, settle, spendable } from '../money.js';
import { jsonSafe, toDb } from '../units.js';
import { deriveDescription, deriveTitle, nextQuestions, TRASH_TTL_MS } from '../intake.js';
import { generateIntakeBatch } from '../llm/generate.js';
import { answerIntakeQuestion, answerIntakeBatch, createQuestion } from '../answer-flow.js';
import { resolveLength } from '../length.js';
import { assertCanCreateRun } from '../limits.js';
import { createJob, jobStatus, submitAndComplete, signSplit, isEscrowConfigured } from '../escrow/jobs.js';

export const runs = Router();

// Every route below is somebody's project. The wallet session is the account,
// so there is no separate Dr. Nib sign-in and no way to reach another
// person's run.
runs.use((req, res, next) => auth.middleware(req, res, next));
// Retried mutating requests replay instead of executing twice (see idempotency.js).
runs.use((req, res, next) => idempotency(req, res, next));

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
    // A live run holds a funded cap and spends provider money: cap how many a
    // user can have in flight at once (denial-of-wallet guard).
    const gate = await assertCanCreateRun(req.user.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error, active: gate.active, cap: gate.cap });
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
    // The opener is a BATCH: up to 5 questions generated for the topic in one
    // call when a model is configured — a generic first question is where
    // "this feels canned" comes from. Bank fallback keeps creation instant
    // and infallible either way. The live call races a 15s clock: long enough
    // for the router to answer most of the time (LLM-first is the point —
    // bank is the fallback, not the product), short enough that creation
    // never hangs behind a slow model (proxies and clients time out long
    // before users do — an empty 500 from a dropped socket is worse than
    // bank questions).
    let questions = nextQuestions([], 5);
    try {
      const live = await Promise.race([
        generateIntakeBatch({ topic: topic.trim(), answered: [], count: 5 }),
        new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
      ]);
      if (live?.questions?.length) questions = live.questions.map((q) => ({ ...q, source: 'llm' }));
      else console.log(`[dr-nib] intake batch fell back to bank for run=${run.id}: ${live?.llmError || 'race timed out / no usable questions'}`);
    } catch {}
    for (let i = 0; i < questions.length; i += 1) {
      await createQuestion(run.id, i, questions[i]);
      questions[i] = { ...questions[i], seq: i };
    }
    res.status(201).json({ id: run.id, title: run.title, description: run.description, status: run.status, question: questions[0] || null, questions });
  } catch (e) {
    // Log the stack server-side: several live incidents returned this 500
    // with the run row already created (question-less zombies that then
    // pile into the live-run cap), and the message alone never says where.
    try { console.error('[runs:create] failed', e?.stack || e?.message || e); } catch {}
    res.status(500).json({ error: e.message });
  }
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
    // The feed's raw material: recent events (tool calls with results, status
    // transitions, questions) ride along so the page renders the full timeline
    // from one fetch — the SSE stream then only nudges it to reload.
    const events = await replayEvents(run.id, -1, 300);
    res.json(jsonSafe({ ...(await withBudget(full)), events }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Skip the rest of intake: the user said "just plan it". Only from intake —
// once planning starts there is nothing to skip. Unanswered questions stay
// unanswered; JEV never sees them, and the brief goes to planning as-is.
runs.post('/:id/intake/finish', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'intake') return res.status(409).json({ error: `nothing to skip from ${run.status}` });
    const updated = await db.researchRun.update({ where: { id: run.id }, data: { status: 'intake-done' } });
    await recordEvent(run.id, { type: 'status', status: 'intake-done', skipped: true });
    res.json({ id: updated.id, status: updated.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Answer the current intake question. Re-answering invalidates the transcript
// after it, and sharpens the project's title/description/metadata. The flow
// itself lives in answer-flow.js so the MCP server advances the same
// transcript through the same code.
runs.post('/:id/answers', async (req, res) => {
  try {
    const { seq, answer } = req.body || {};
    const run = await ownedRun(req, res);
    if (!run) return;
    const out = await answerIntakeQuestion(run, seq, answer);
    res.status(out.status).json(out.body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Answer a whole batch at once: one thinking per answer, one stop decision,
// one next batch. All-or-nothing — a batch containing an unknown or already-
// answered question is rejected whole so the transcript never half-advances.
runs.post('/:id/answers/batch', async (req, res) => {
  try {
    const { answers } = req.body || {};
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'intake') return res.status(409).json({ error: `intake is ${run.status} — answers are closed` });
    const out = await answerIntakeBatch(run, answers);
    res.status(out.status).json(out.body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Configure, then plan. This is where a budget first exists: the cap is
// selected here and held before anything is spent. Length (preset or exact
// word count) is resolved here too, so the plan is priced for the report the
// user actually asked for — never a silent default.
runs.post('/:id/configure', async (req, res) => {
  try {
    const {
      depth = 'standard', budgetCap, liveWeb = true,
      language = 'en', perspective = 'neutral', formats = ['pdf'],
      length = 'standard', lengthWords = null,
    } = req.body || {};
    if (!(Number(budgetCap) > 0)) return res.status(400).json({ error: 'budgetCap must be > 0' });
    const run = await ownedRun(req, res);
    if (!run) return;
    // Re-planning from review is a supported loop: bounds changed, plan
    // again. Safe pre-approval (nothing spent; the deposit row below is
    // idempotent). The UI's Back-to-configure depends on this — without it
    // the second Plan click 409s and strands the user.
    if (!['intake-done', 'planning', 'planned'].includes(run.status)) {
      return res.status(409).json({ error: `cannot configure from ${run.status}` });
    }
    const resolvedLength = resolveLength({ length, lengthWords });
    const brief = { ...(run.brief || {}), depth, liveWeb, language, perspective, formats, length: resolvedLength.preset, lengthWords: resolvedLength.words };
    await db.researchRun.update({
      where: { id: run.id },
      data: { depth, budgetCap: toDb(budgetCap), brief, status: 'planning', pauseReason: null },
    });
    const holds = await db.budgetLedger.findFirst({ where: { runId: run.id, kind: 'deposit' } });
    if (!holds) await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: toDb(budgetCap) } });
    await requestPlan(run.id);
    res.status(202).json({ id: run.id, status: 'planning', length: resolvedLength });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.post('/:id/approve', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'planned') return res.status(409).json({ error: `cannot approve from ${run.status}` });
    // Approving is accepting the spend: the balance must cover the plan's own
    // estimate, or the run would pause almost immediately with nothing learned.
    // A plan with no estimate has not finished planning — approving it would be
    // accepting an unknown spend, so wait instead.
    const { used } = await budgetState(run.id);
    const estimate = Number(run.plan?.estimate);
    if (!Number.isFinite(estimate)) {
      return res.status(409).json({ error: 'plan has no estimate yet — wait for planning to finish' });
    }
    // Spendable, not ledger balance: a revised-then-settled run reads
    // negative balance while its cap still authorizes spend (see money.js).
    const left = spendable(run.budgetCap, used);
    if (left < estimate) {
      return res.status(409).json({ error: `balance $${left.toFixed(2)} is below the plan estimate $${estimate.toFixed(2)} — raise the cap first` });
    }
    // Escrowed runs move real money: the onchain job must be Funded for at
    // least the cap before anything executes. Runs without escrow keep the
    // ledger-only path.
    const escrow = escrowOf(run);
    if (escrow?.jobId) {
      const chain = await jobStatus(escrow.jobId).catch((e) => ({ error: e.message }));
      if (chain.error) return res.status(503).json({ error: `cannot read escrow job: ${chain.error}` });
      if (chain.status !== 'Funded') {
        return res.status(409).json({ error: `escrow job ${escrow.jobId} is ${chain.status} — fund it onchain first` });
      }
      if (!(chain.budget >= Number(run.budgetCap))) {
        return res.status(409).json({ error: `escrow holds $${chain.budget} but the cap is $${Number(run.budgetCap)} — fund the difference first` });
      }
      await db.researchRun.update({
        where: { id: run.id },
        data: { metadata: { ...(run.metadata || {}), escrow: { ...escrow, status: 'Funded' } } },
      });
    }
    await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
    await requestExecute(run.id);
    res.json({ id: run.id, status: 'running' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Edit the plan: add, drop, or reorder sub-questions, with live re-pricing.
// Allowed while the plan is still a proposal (planning/planned) — never
// mid-run, where changing the questions would orphan collected evidence.
// Every edit is a new plan version on the same record; nothing is destroyed.
runs.patch('/:id/plan', async (req, res) => {
  try {
    const { sub_questions: subQuestions } = req.body || {};
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'planning' && run.status !== 'planned') {
      return res.status(409).json({ error: `cannot edit the plan from ${run.status} — plans edit before approval, revisions continue after` });
    }
    if (!Array.isArray(subQuestions) || !subQuestions.length || subQuestions.length > 12) {
      return res.status(400).json({ error: 'sub_questions must be 1-12 non-empty strings' });
    }
    const cleaned = subQuestions.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 12);
    if (!cleaned.length) return res.status(400).json({ error: 'sub_questions must be 1-12 non-empty strings' });
    const estimate = estimatePlanCost({
      subQuestions: cleaned,
      depth: run.brief?.depth,
      lengthWords: run.brief?.lengthWords,
    });
    const updated = await db.researchRun.update({
      where: { id: run.id },
      data: { plan: { sub_questions: cleaned, estimate, edited: true }, status: 'planned' },
    });
    await recordEvent(run.id, { type: 'plan.edited', estimate, sub_questions: cleaned });
    res.json({ id: run.id, status: 'planned', plan: updated.plan });
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
    await recordEvent(run.id, { type: 'status', status: 'paused', pauseReason: 'user' });
    res.json({ id: run.id, status: 'paused', pauseReason: 'user' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.post('/:id/resume', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'paused') return res.status(409).json({ error: `cannot resume from ${run.status}` });
    const { balance } = await budgetState(run.id);
    if (balance <= 0) return res.status(409).json({ error: 'out of budget — raise the cap or end the run' });
    await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
    await recordEvent(run.id, { type: 'status', status: 'running' });
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
    await recordEvent(run.id, { type: 'status', status: 'ended', pauseReason: 'user' });
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
    const { text, optionId } = req.body || {};
    const options = Array.isArray(question?.options) ? question.options : [];
    const picked = optionId ? options.find((o) => o?.id === optionId) : null;
    if (optionId && !picked) return res.status(400).json({ error: 'unknown option for this question' });
    const answerText = picked ? (picked.label || picked.id) : String(text ?? '').trim();
    if (!answerText) return res.status(400).json({ error: 'answer the parked question or say "either" — empty answers do not resume the run' });
    await db.researchDecision.create({
      data: {
        runId: run.id,
        seq: await nextSeq(run.id),
        kind: 'question',
        type: question?.type || 'pick_one',
        step: 'midrun',
        prompt: question?.prompt || null,
        question: question || {},
        answer: picked ? { optionIds: [picked.id], text: answerText } : { text: answerText },
        answeredAt: new Date(),
      },
    });
    await db.researchRun.update({
      where: { id: run.id },
      data: { status: 'running', pauseReason: null, pendingQuestion: null, brief: { ...(run.brief || {}), guidance: answerText } },
    });
    await recordEvent(run.id, { type: 'status', status: 'running', answered: question?.id ?? null });
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
    await recordEvent(run.id, { type: 'guidance.queued' });
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
    await recordEvent(run.id, { type: 'budget.raised', cap: result.budgetCap, balance: result.balance });
    if (run.status === 'paused' && run.pauseReason === 'cap' && result.balance > 0) {
      await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
      await recordEvent(run.id, { type: 'status', status: 'running' });
      await requestExecute(run.id);
    }
    res.json({ id: run.id, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/:id/events', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  // Reconnect support: a client that drops mid-run replays stored events after
  // its cursor (SSE Last-Event-ID, or ?after=) before attaching to the live
  // channel, so history is never lost to a disconnect.
  const cursor = req.headers['last-event-id'] ?? req.query.after;
  const afterSeq = Number.isFinite(Number(cursor)) ? Number(cursor) : -1;
  res.write(`event: hello\ndata: ${JSON.stringify({ type: 'hello', status: run.status })}\n\n`);
  const replay = await replayEvents(run.id, afterSeq);
  for (const e of replay) {
    res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
  }
  subscribe(run.id, res);
});

runs.post('/:id/revise', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    // Reprompt: a finished run goes again with a new prompt. The version bump
    // means every stage re-executes (skip is per-version), and the prompt is
    // held as guidance so it steers the new pass at the stage boundary.
    if (!['complete', 'failed', 'ended', 'paused'].includes(run.status)) {
      return res.status(409).json({ error: `reprompt from ${run.status} — finish, fail, end, or pause the run first` });
    }
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 2000) : '';
    const { used } = await budgetState(run.id);
    if (!(spendable(run.budgetCap, used) > 0)) return res.status(409).json({ error: 'out of budget — raise the cap first' });
    const version = run.versions + 1;
    await db.researchRun.update({
      where: { id: run.id },
      data: {
        versions: version, status: 'running', pauseReason: null,
        ...(prompt ? { pendingGuidance: { text: prompt } } : {}),
      },
    });
    await recordEvent(run.id, { type: 'status', status: 'running', version, reprompt: prompt ? true : undefined });
    await requestExecute(run.id);
    res.status(202).json({ id: run.id, version, status: 'running' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Research escrow (ERC-8183, see dr-nib/ESCROW.md). Optional per run: when a
// run carries an escrow job, approve requires it Funded onchain and settle
// completes it onchain. Runs without one keep the ledger-only path — nothing
// already working changes.
function escrowOf(run) {
  return (run.metadata && run.metadata.escrow) || null;
}

runs.post('/:id/escrow', async (req, res) => {
  try {
    if (!isEscrowConfigured()) return res.status(501).json({ error: 'escrow is not configured on this deployment' });
    const run = await ownedRun(req, res);
    if (!run) return;
    if (!['planning', 'planned'].includes(run.status)) {
      return res.status(409).json({ error: `escrow opens from planning/planned, not ${run.status}` });
    }
    if (escrowOf(run)?.jobId) return res.status(409).json({ error: 'this run already has an escrow job' });
    const client = String(req.body?.client || req.user.walletAddress || '');
    if (!/^0x[0-9a-fA-F]{40}$/.test(client)) return res.status(400).json({ error: 'client wallet address is required' });
    const hours = Math.min(Math.max(Number(req.body?.expiryHours) || 72, 1), 720);
    const out = await createJob({
      client,
      budget: Number(run.budgetCap),
      description: `Dr. Nib run: ${run.title || run.brief?.topic || run.id}`.slice(0, 280),
      expiredAt: Math.floor(Date.now() / 1000) + hours * 3600,
    });
    const updated = await db.researchRun.update({
      where: { id: run.id },
      data: { metadata: { ...(run.metadata || {}), escrow: { ...out, status: 'Open' } } },
    });
    await recordEvent(run.id, { type: 'escrow.created', jobId: out.jobId });
    res.status(201).json(escrowOf(updated));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/:id/escrow', async (req, res) => {
  try {
    const run = await ownedRun(req, res, { allowDeleted: true });
    if (!run) return;
    const local = escrowOf(run);
    if (!local?.jobId) return res.json({ configured: isEscrowConfigured(), job: null });
    const chain = await jobStatus(local.jobId).catch((e) => ({ error: e.message }));
    res.json({ configured: true, job: { ...local, chain } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.post('/:id/escrow/complete', async (req, res) => {
  try {
    if (!isEscrowConfigured()) return res.status(501).json({ error: 'escrow is not configured on this deployment' });
    const run = await ownedRun(req, res);
    if (!run) return;
    const local = escrowOf(run);
    if (!local?.jobId) return res.status(409).json({ error: 'this run has no escrow job' });
    if (!['complete', 'failed', 'ended'].includes(run.status)) {
      return res.status(409).json({ error: `settle the run first (status ${run.status})` });
    }
    const report = await db.researchReport.findFirst({ where: { runId: run.id }, orderBy: { version: 'desc' } });
    const { keccak256, toHex } = await import('viem');
    const reportHash = report ? keccak256(toHex(report.markdown)) : '0x';
    const { spend } = await budgetState(run.id);
    // The operator payee is server configuration, never request input: whoever
    // calls this endpoint must not be able to redirect earned funds.
    const operator = process.env.ESCROW_OPERATOR || '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(operator)) {
      return res.status(501).json({ error: 'ESCROW_OPERATOR is not configured on this deployment' });
    }
    let out = null;
    if (local.status !== 'Completed') {
      out = await submitAndComplete({ jobId: local.jobId, reportHash, spentUsd: spend, operator });
    }
    // The client is read offchain-truthfully: the split pays job.client
    // onchain no matter what is signed, so sign the true one.
    const chain = await jobStatus(local.jobId);
    const sig = await signSplit({ jobId: local.jobId, spentUsd: spend, operator, client: chain.client });
    const updated = await db.researchRun.update({
      where: { id: run.id },
      data: { metadata: { ...(run.metadata || {}), escrow: { ...local, status: 'Completed', completeTx: out?.completeTx || local.completeTx || null, splitSig: sig } } },
    });
    await recordEvent(run.id, { type: 'escrow.completed', jobId: local.jobId, completeTx: out?.completeTx || local.completeTx || null });
    res.json(escrowOf(updated));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/:id/report', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  // ?version=N reads an older reprompt version; default is latest.
  const v = Number(req.query.version);
  const report = await db.researchReport.findFirst({
    where: { runId: run.id, ...(Number.isInteger(v) && v > 0 ? { version: v } : {}) },
    orderBy: { version: 'desc' },
  });
  if (!report) return res.status(404).json({ error: 'no report yet' });
  res.json(report);
});

async function nextSeq(runId) {
  const last = await db.researchDecision.findFirst({ where: { runId }, orderBy: { seq: 'desc' } });
  return (last?.seq ?? -1) + 1;
}

// Soft delete → trash, restorable for seven days. A live or paused run has to be
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