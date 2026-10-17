import { sources as sourceRoutes } from '../sources/routes.js';
import { endRun } from '../end-run.js';
import { SOURCE_ORDER, reportSources } from '../report-evidence.js';
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
import { researchAvailability } from '../readiness.js';
import { assertConventionalPath, isLegacyRun } from '../privacy/guard.js';
import { jobStatus, submitAndComplete, signSplit, isEscrowConfigured } from '../escrow/jobs.js';

export const runs = Router();

// Every route below is somebody's project. The wallet session is the account,
// so there is no separate Dr. Nib sign-in and no way to reach another
// person's run.
runs.use((req, res, next) => auth.middleware(req, res, next));
// Retried mutating requests replay instead of executing twice (see idempotency.js).
runs.use((req, res, next) => idempotency(req, res, next));
runs.use('/:id/sources', sourceRoutes);

async function ownedRun(req, res, { allowDeleted = false } = {}) {
  const run = await db.researchRun.findUnique({ where: { id: req.params.id } });
  if (!run || !auth.isOwner(req.user, run)) {
    res.status(404).json({ error: 'project not found' });
    return null;
  }
  try { assertConventionalPath(run); }
  catch (error) { res.status(error.status).json({error:error.message,code:error.code}); return null; }
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
  const expired = await db.researchRun.findMany({where:{deletedAt:{lt:cutoff}},select:{id:true,metadata:true}});
  const legacyIds = expired.filter(isLegacyRun).map((run)=>run.id);
  if (legacyIds.length) await db.researchRun.deleteMany({where:{id:{in:legacyIds},deletedAt:{lt:cutoff}}});
}

// The project belongs to the signed-in wallet from the moment it exists. The
// title and description are a first guess from the prompt and keep sharpening
// as the intake conversation goes on.
runs.post('/', async (req, res) => {
  try {
    // Do not silently create a conventional plaintext run when confidential
    // processing was requested by a future client or API caller.
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'privacyMode') && req.body.privacyMode !== 'legacy') {
      return res.status(503).json({error:'Confidential processing is unavailable on this deployment.',code:'CONFIDENTIAL_BOUNDARY_UNAVAILABLE'});
    }
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
    // Keep the opener short: three focused questions reduce both generation
    // latency and user effort. Give the model a bounded 25s window and abort
    // expired work rather than leaving a discarded completion running.
    let questions = nextQuestions([], 5);
    try {
      const live = await generateIntakeBatch({
        topic: topic.trim(), answered: [], count: 3,
        signal: AbortSignal.timeout(25_000),
      });
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
    // Keep ordinary projects visible; don't expand an unready private record
    // into the conventional run-list response.
    const visibleRows = rows.filter(isLegacyRun);
    res.json(jsonSafe({
      runs: visibleRows.map((r) => {
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
        // Chip [n] is sources[n-1] (see ReportMarkdown citeFor), and the
        // writer numbers evidence trust-desc (see writeStage) — so the read
        // must use the same order or chips point at the wrong URLs.
        sources: { orderBy: SOURCE_ORDER },
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
  } catch (e) {
    try { console.error(`[runs:get] ${req.params?.id} failed`, e?.stack || e?.message || e); } catch {}
    res.status(500).json({ error: e.message });
  }
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
      length = 'standard', lengthWords = null, tipCreators = false,
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
    if (liveWeb === false && !(await db.researchStep.count({where:{runId:run.id,kind:'input',status:'done'}}))) return res.status(400).json({error:'Attach at least one readable source before choosing user sources only.'});
    const resolvedLength = resolveLength({ length, lengthWords });
    const brief = { ...(run.brief || {}), depth, liveWeb, language, perspective, formats, length: resolvedLength.preset, lengthWords: resolvedLength.words, tipCreators: tipCreators === true };
    await db.researchRun.update({
      where: { id: run.id },
      data: { depth, budgetCap: toDb(budgetCap), brief, status: 'planning', pauseReason: null,metadata:{...(run.metadata||{}),planningPending:true,planRevision:(Number(run.metadata?.planRevision)||0)+1} },
    });
    // The ledger deposit mirrors verified money, never intent: on escrow
    // deployments it is written at approve from the onchain Funded budget
    // (see approve). Only the ledger-only path books the cap here.
    if (!isEscrowConfigured()) {
      const holds = await db.budgetLedger.findFirst({ where: { runId: run.id, kind: 'deposit' } });
      if (!holds) await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: toDb(budgetCap) } });
    }
    await requestPlan(run.id);
    res.status(202).json({ id: run.id, status: 'planning', length: resolvedLength });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.post('/:id/approve', async (req, res) => {
  try {
    if (!researchAvailability().acceptingRuns) return res.status(503).json({ error: 'Mainnet funded research is not open yet. Try the testnet preview.' });
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'planned') return res.status(409).json({ error: `cannot approve from ${run.status}` });
    if (run.plan?.source === 'fallback') return res.status(503).json({ error: 'Planning is temporarily unavailable. Retry the plan before funding or approving this run.' });
    // Approving is accepting the spend: the balance must cover the plan's own
    // estimate, or the run would pause almost immediately with nothing learned.
    // A plan with no estimate has not finished planning — approving it would be
    // accepting an unknown spend, so wait instead.
    if (run.settledAt || run.metadata?.escrow?.status === 'Completed') return res.status(409).json({error:'This budget has settled. Duplicate the project and fund a new run; refunded money cannot be reused.'});
    if (await db.researchStep.count({where:{runId:run.id,status:'active'}})) return res.status(409).json({error:'Wait for the current stage to finish before restarting.'});
    const { used } = await budgetState(run.id);
    const estimate = Number(run.plan?.estimate);
    if (!Number.isFinite(estimate)) {
      return res.status(409).json({ error: 'plan has no estimate yet — wait for planning to finish' });
    }
    // Check cap headroom before the onchain funding gate below. A cap alone
    // never authorizes spending money that has already been refunded.
    const left = spendable(run.budgetCap, used);
    if (left < estimate) {
      return res.status(409).json({ error: `balance $${left.toFixed(2)} is below the plan estimate $${estimate.toFixed(2)} — raise the cap first` });
    }
    // Escrowed runs move real money: the onchain job must be Funded for at
    // least the plan estimate before anything executes — not the full cap.
    // Funding is one-shot (the core flips Open→Funded on fund(), no top-ups),
    // so the deposit is the working budget: approve aligns the cap down to
    // what actually landed, keeping the deposited==cap invariant draw() and
    // raiseCap() rely on. The configured cap is kept as targetCap for display.
    // Runs without escrow keep the ledger-only path.
    //
    // Where escrow is configured it is mandatory, not opt-in: approve verifies
    // the deposit onchain and books the ledger from the verified budget, so
    // the offchain balance always trails real money. Unfunded runs stop here
    // with the funding step named.
    const escrow = escrowOf(run);
    if (isEscrowConfigured()) {
      if (!escrow?.jobId) {
        return res.status(409).json({ error: 'no onchain deposit yet — fund the run escrow first, then approve' });
      }
      const chain = await jobStatus(escrow.jobId).catch((e) => ({ error: e.message }));
      if (chain.error) return res.status(503).json({ error: `cannot read escrow job: ${chain.error}` });
      if (chain.status !== 'Funded') {
        return res.status(409).json({ error: `escrow job ${escrow.jobId} is ${chain.status} — fund it onchain first` });
      }
      if (!(chain.budget >= estimate)) {
        return res.status(409).json({ error: `escrow holds $${chain.budget} but the plan needs $${estimate.toFixed(2)} — fund at least the estimate first` });
      }
      await db.researchRun.update({
        where: { id: run.id },
        data: {
          budgetCap: toDb(chain.budget),
          metadata: { ...(run.metadata || {}), escrow: { ...escrow, status: 'Funded', targetCap: Number(run.budgetCap) } },
        },
      });
      // Book the verified budget, not the requested cap: the ledger trails
      // the chain. Idempotent top-up (re-approvals, re-funds).
      const have = await db.budgetLedger.findMany({ where: { runId: run.id, kind: 'deposit' } });
      const haveTotal = have.reduce((s, r) => s + Number(r.amount), 0);
      if (chain.budget > haveTotal) {
        await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: toDb(chain.budget - haveTotal) } });
      }
    } else if (escrow?.jobId) {
      const chain = await jobStatus(escrow.jobId).catch((e) => ({ error: e.message }));
      if (chain.error) return res.status(503).json({ error: `cannot read escrow job: ${chain.error}` });
      if (chain.status !== 'Funded') {
        return res.status(409).json({ error: `escrow job ${escrow.jobId} is ${chain.status} — fund it onchain first` });
      }
      if (!(chain.budget >= estimate)) {
        return res.status(409).json({ error: `escrow holds $${chain.budget} but the plan needs $${estimate.toFixed(2)} — fund at least the estimate first` });
      }
      await db.researchRun.update({
        where: { id: run.id },
        data: {
          budgetCap: toDb(chain.budget),
          metadata: { ...(run.metadata || {}), escrow: { ...escrow, status: 'Funded', targetCap: Number(run.budgetCap) } },
        },
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
      data: { plan: { sub_questions: cleaned, estimate, edited: true, source: run.plan?.source || 'edited' }, status: 'planned' },
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
    if(run.settledAt)return res.status(409).json({error:'This budget has settled. Start a fresh funded run.'});
    const { balance } = await budgetState(run.id);
    if (balance <= 0 && !run.metadata?.planningPending) {
      // Escrow deposits are one-shot: an exhausted deposit cannot be topped
      // up, so "raise the cap" would be a lie here — name the actual outs.
      const escrow = escrowOf(run);
      if (escrow?.jobId && isEscrowConfigured()) {
        return res.status(409).json({ error: 'the escrow deposit is fully spent and deposits are one-shot — end the run (the report so far is kept) or start a new run' });
      }
      return res.status(409).json({ error: 'out of budget — raise the cap or end the run' });
    }
    const status=run.metadata?.planningPending ? 'planning' : 'running';
    await db.researchRun.update({ where: { id: run.id }, data: { status, pauseReason: null } });
    await recordEvent(run.id, { type: 'status', status });
    if(status==='planning')await requestPlan(run.id);else await requestExecute(run.id);
    res.json({ id: run.id, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// End it: the work already done is kept, the unspent balance comes back now.
runs.post('/:id/end', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    const result=await endRun(run.id);
    res.status(result.pending ? 202 : 200).json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// The mid-run question card. The run parks, the owner answers, and the run picks
// up from the stage boundary it stopped at.
runs.post('/:id/awaiting/answer', async (req, res) => {
  try {
    const { text, optionId } = req.body || {};
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'awaiting') return res.status(409).json({ error: 'the run is not waiting on you' });
    const question = run.pendingQuestion;
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
// On escrow runs the raise trails the chain too: the onchain budget must
// cover the new cap first (top up in the wallet), otherwise the ledger would
// authorize spend the contract does not hold.
runs.post('/:id/budget', async (req, res) => {
  try {
    const { amount, txRef } = req.body || {};
    const run = await ownedRun(req, res);
    if (!run) return;
    const escrow = escrowOf(run);
    if (escrow?.jobId && isEscrowConfigured()) {
      const chain = await jobStatus(escrow.jobId).catch((e) => ({ error: e.message }));
      if (chain.error) return res.status(503).json({ error: `cannot read escrow job: ${chain.error}` });
      if (!(chain.budget >= Number(amount))) {
        // Escrow deposits are one-shot (the core flips Open→Funded on fund):
        // a Funded job can never be topped up, so the cap cannot pass what
        // is already escrowed. Say so outright instead of sending the owner
        // to fund a difference the chain cannot accept.
        return res.status(409).json({ error: `escrow holds $${chain.budget} on a Funded job — deposits are one-shot, so the cap cannot pass $${chain.budget} on this run. End it and start a new run for a bigger budget` });
      }
    }
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
    if (run.settledAt || run.metadata?.escrow?.status === 'Completed') return res.status(409).json({error:'This budget has settled. Duplicate the project and fund a new run; refunded money cannot be reused.'});
    if (await db.researchStep.count({where:{runId:run.id,status:'active'}})) return res.status(409).json({error:'Wait for the current stage to finish before restarting.'});
    const { used } = await budgetState(run.id);
    if (!(spendable(run.budgetCap, used) > 0)) return res.status(409).json({ error: 'out of budget — raise the cap first' });
    const version = run.versions + 1;
    // Threading: the steer that produced each version is kept on the run, so
    // the version selector can say what v2 was asked to do differently. The
    // guidance itself is still consumed via pendingGuidance as before.
    const versionPrompts = { ...((run.metadata || {}).versionPrompts || {}) };
    if (prompt) versionPrompts[version] = prompt;
    await db.researchRun.update({
      where: { id: run.id },
      data: {
        versions: version, status: 'running', pauseReason: null,
        metadata: { ...(run.metadata || {}), versionPrompts },
        ...(prompt ? { pendingGuidance: { text: prompt } } : {}),
      },
    });
    await recordEvent(run.id, { type: 'status', status: 'running', version, reprompt: prompt ? true : undefined });
    await requestExecute(run.id);
    res.status(202).json({ id: run.id, version, status: 'running' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Research escrow (ERC-8183, see dr-nib/ESCROW.md). Optional per run: when a
// run carries an escrow job, approve requires it Funded onchain for at least
// the plan estimate (not the full cap — deposits are one-shot and the
// working cap aligns to what landed) and settle completes it onchain. Runs
// without one keep the ledger-only path — nothing already working changes.
function escrowOf(run) {
  return (run.metadata && run.metadata.escrow) || null;
}

runs.post('/:id/escrow', async (req, res) => {
  try {
    if (!isEscrowConfigured()) return res.status(501).json({ error: 'escrow is not configured on this deployment' });
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'planned') return res.status(409).json({ error: `escrow opens after planning, not ${run.status}` });
    if (run.plan?.source === 'fallback') return res.status(503).json({ error: 'Planning is temporarily unavailable. Retry the plan before depositing.' });
    if (escrowOf(run)?.jobId) return res.status(409).json({ error: 'this run already has an escrow job' });
    // The USER's wallet sends createJob (the stock core sets client =
    // msg.sender — a relayed create would make an unfundable keeper-cliented
    // job). The backend only hands out the exact call parameters; the job
    // lands on-chain via POST /:id/escrow/register below.
    const { createParams, assertEscrowOperational } = await import('../escrow/jobs.js');
    try { await assertEscrowOperational(); }
    catch {
      return res.status(503).json({ code: 'settlement-unavailable', error: 'Research funding is temporarily unavailable while settlement is being prepared. No deposit was requested. Please try again later.' });
    }
    const params = createParams({
      description: `Dr. Nib run: ${run.title || run.brief?.topic || run.id}`,
      expiryHours: req.body?.expiryHours,
    });
    res.status(200).json({ runId: run.id, ...params });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Register a user-created job: verify onchain that it is real, Open, owned
// by this run's wallet, and pointed at our splitter + evaluator — then store
// it. Trusts the chain, never the request body.
runs.post('/:id/escrow/register', async (req, res) => {
  try {
    if (!isEscrowConfigured()) return res.status(501).json({ error: 'escrow is not configured on this deployment' });
    const run = await ownedRun(req, res);
    if (!run) return;
    if (run.status !== 'planned') return res.status(409).json({ error: `escrow opens after planning, not ${run.status}` });
    if (run.plan?.source === 'fallback') return res.status(503).json({ error: 'Planning is temporarily unavailable. Retry the plan before registering an escrow job.' });
    if (escrowOf(run)?.jobId) return res.status(409).json({ error: 'this run already has an escrow job' });
    const jobId = String(req.body?.jobId || '').trim();
    if (!/^\d+$/.test(jobId)) return res.status(400).json({ error: 'jobId is required' });
    const chain = await jobStatus(jobId).catch((e) => ({ error: e.message }));
    if (chain.error) return res.status(503).json({ error: `cannot read escrow job: ${chain.error}` });
    if (chain.status !== 'Open') {
      return res.status(409).json({ error: `job ${jobId} is ${chain.status} — register it while it is still Open` });
    }
    const owner = String(run.walletAddress || '').toLowerCase();
    if (!owner || String(chain.client || '').toLowerCase() !== owner) {
      return res.status(409).json({ error: `job ${jobId} can't be funded from this run's wallet (opened by another wallet or the old relay flow) — duplicate the run to start fresh with your own job` });
    }
    const { escrowConfig } = await import('../escrow/jobs.js');
    const cfg = escrowConfig();
    if (String(chain.provider || '').toLowerCase() !== String(cfg.splitter || '').toLowerCase()) {
      return res.status(409).json({ error: `job ${jobId} does not point at this run's splitter` });
    }
    const updated = await db.researchRun.update({
      where: { id: run.id },
      data: { metadata: { ...(run.metadata || {}), escrow: { jobId, core: cfg.core, splitter: cfg.splitter, status: 'Open' } } },
    });
    await recordEvent(run.id, { type: 'escrow.created', jobId });
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
    const { settleEscrowRun } = await import('../escrow/settle.js');
    const result = await settleEscrowRun(run.id, 'owner-retry');
    const updated = await db.researchRun.findUnique({ where: { id: run.id } });
    if (result.reason === 'no-operator') return res.status(501).json({ error: 'Settlement is not configured. Contact support.' });
    if (result.reason === 'error') return res.status(503).json({ error: 'Settlement could not complete yet. Funds remain in escrow and will retry automatically.' });
    res.json({ ...escrowOf(updated), pending: Boolean(result.pending) });
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

// Post-report discussion: free follow-up questions about a finished report.
// The books are closed — this draws nothing from the ledger and needs no
// deposit. The operator absorbs the pennies (one bounded low-effort call per
// question), so each finished run carries a small free allowance instead:
// DISCUSS_MAX_QUESTIONS questions, each answered from the report and its own
// evidence only. Usage rides in metadata.discuss (surfaced on GET run) and
// every answer is a 'discuss' event with its provider cost, so the free
// tier stays auditable instead of invisible.
const DISCUSS_MAX_QUESTIONS = Math.max(1, Number(process.env.DRNIB_DISCUSS_MAX_QUESTIONS || 10));
const DISCUSS_MAX_TOKENS = Math.max(200, Number(process.env.DRNIB_DISCUSS_MAX_TOKENS || 600));
const DISCUSS_CONTEXT_CHARS = 12000;
const DISCUSS_TERMINAL = ['complete', 'failed', 'ended'];

runs.post('/:id/discuss', async (req, res) => {
  try {
    const run = await ownedRun(req, res);
    if (!run) return;
    if (!DISCUSS_TERMINAL.includes(run.status)) {
      return res.status(409).json({ error: `discussion opens once the run is finished (status ${run.status})` });
    }
    const report = await db.researchReport.findFirst({ where: { runId: run.id }, orderBy: { version: 'desc' } });
    if (!report?.markdown) return res.status(409).json({ error: 'no finished report to discuss yet' });
    const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 1000) : '';
    if (!question) return res.status(400).json({ error: 'question is required' });
    const state = run.metadata?.discuss || { used: 0, tokens: 0, log: [] };
    const used = Number(state.used) || 0;
    if (used >= DISCUSS_MAX_QUESTIONS) {
      return res.status(429).json({ error: `free discussion allowance used up (${DISCUSS_MAX_QUESTIONS} of ${DISCUSS_MAX_QUESTIONS}) — reprompt the run for a deeper pass`, used, remaining: 0, max: DISCUSS_MAX_QUESTIONS });
    }
    const { chat, isLlmConfigured } = await import('../llm/provider.js');
    if (!isLlmConfigured()) return res.status(501).json({ error: 'discussion is not configured on this deployment' });
    const sources = await db.researchSource.findMany({ where: { runId: run.id }, orderBy: SOURCE_ORDER });
    const sourceLines = reportSources(report, sources).slice(0, 30).map((s, i) => `[${i + 1}] ${s.title || s.url} — ${s.url}`).join('\n');
    const prior = (Array.isArray(state.log) ? state.log : []).slice(-4)
      .map((t) => `Q: ${t.q}\nA: ${t.a}`).join('\n\n');
    const { text, usage, model } = await chat({
      effort: 'low',
      maxTokens: DISCUSS_MAX_TOKENS,
      messages: [
        { role: 'system', content: 'You are discussing a finished research report with its owner. Answer strictly from the report and sources below — cite claims as [n] using the source numbers given. If the report does not cover it, say so plainly in one sentence instead of reaching beyond the evidence. Keep it under 250 words, no new headings.' },
        { role: 'user', content: `Report:\n${String(report.markdown).slice(0, DISCUSS_CONTEXT_CHARS)}\n\nSources:\n${sourceLines || '(none listed)'}${prior ? `\n\nEarlier in this discussion:\n${prior}` : ''}\n\nQuestion: ${question}` },
      ],
    });
    const tokens = Number(usage?.totalTokens) || 0;
    const answer = String(text || '').trim() || 'No answer came back — try rephrasing the question.';
    const entry = { q: question.slice(0, 300), a: answer.slice(0, 2000), tokens, at: new Date().toISOString() };
    const log = [...(Array.isArray(state.log) ? state.log : []), entry].slice(-DISCUSS_MAX_QUESTIONS);
    const next = { used: used + 1, tokens: (Number(state.tokens) || 0) + tokens, log };
    await db.researchRun.update({ where: { id: run.id }, data: { metadata: { ...(run.metadata || {}), discuss: next } } });
    await recordEvent(run.id, { type: 'discuss', q: question.slice(0, 200), tokens, costUsd: usage?.costUsd ?? null, model: model || null, used: next.used, remaining: DISCUSS_MAX_QUESTIONS - next.used });
    res.json({ answer, used: next.used, remaining: DISCUSS_MAX_QUESTIONS - next.used, max: DISCUSS_MAX_QUESTIONS });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
