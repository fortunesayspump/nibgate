// MCP tools — the same run flows, callable by agents.
//
// Each tool mirrors an HTTP route's contract (same ownership rule, same status
// gates, same money functions) so the two surfaces cannot disagree about what
// a run is. The one non-trivial flow — answering intake questions — is not
// mirrored but shared outright (see answer-flow.js).
//
// Ownership here is by wallet: the agent names the owner wallet on every call
// and it must match the run's payout wallet (case-insensitive). Runs the agent
// creates are namespaced to that wallet, so wallet access never crosses
// accounts.
import { db } from '../db.js';
import { applyAnswer, deriveDescription, deriveTitle, nextQuestions } from '../intake.js';
import { answerIntakeQuestion, answerIntakeBatch, createQuestion } from '../answer-flow.js';
import { budgetState, raiseCap, settle } from '../money.js';
import { jsonSafe, toDb } from '../units.js';
import { requestExecute, requestPlan } from '../worker.js';
import { recordEvent } from '../eventlog.js';
import { assertCanCreateRun } from '../limits.js';

function checkWallet(wallet) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(wallet || ''))) {
    return { error: 'ownerWallet must be a 0x address' };
  }
  return null;
}

async function ownedRun(runId, wallet) {
  const run = await db.researchRun.findUnique({ where: { id: runId } });
  if (!run || run.walletAddress?.toLowerCase() !== String(wallet).toLowerCase()) {
    return { error: 'project not found', run: null };
  }
  if (run.deletedAt) return { error: 'project is deleted', run: null };
  return { run };
}

async function withBudget(run) {
  const full = await db.researchRun.findUnique({
    where: { id: run.id },
    include: { steps: { orderBy: { createdAt: 'asc' } }, sources: true, claims: true, reports: { orderBy: { version: 'desc' }, take: 1 } },
  });
  const { ledger, ...rest } = full;
  return jsonSafe({ ...rest, ...(await budgetState(run.id)) });
}

export const TOOLS = [
  {
    name: 'create_run',
    description: 'Open a research project for a wallet: creates the brief, asks the first intake question, returns the run. Send is wallet-gated like the UI composer.',
    input: { ownerWallet: '0x…', topic: 'what to research' },
    async run({ ownerWallet, topic }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      if (!topic || typeof topic !== 'string' || !topic.trim()) throw new Error('topic is required');
      const userId = `wallet:${String(ownerWallet).toLowerCase()}`;
      const gate = await assertCanCreateRun(userId);
      if (!gate.ok) throw new Error(gate.error);
      const run = await db.researchRun.create({
        data: {
          userId,
          walletAddress: ownerWallet,
          title: deriveTitle(topic),
          description: deriveDescription(topic),
          brief: { topic: topic.trim() },
          metadata: {},
          status: 'intake',
        },
      });
      const questions = nextQuestions([], 5);
      for (let i = 0; i < questions.length; i += 1) {
        await createQuestion(run.id, i, questions[i]);
        questions[i] = { ...questions[i], seq: i };
      }
      return { id: run.id, title: run.title, description: run.description, status: run.status, question: questions[0] || null, questions };
    },
  },
  {
    name: 'get_run',
    description: 'Read a run with its plan, steps, sources, claims, latest report, and live budget.',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      return withBudget(run);
    },
  },
  {
    name: 'answer_question',
    description: 'Answer the current intake question (by seq). Advances the transcript, sharpens the brief, and may complete intake.',
    input: { ownerWallet: '0x…', runId: 'uuid', seq: 0, answer: { optionIds: [], text: '' } },
    async run({ ownerWallet, runId, seq, answer }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      const out = await answerIntakeQuestion(run, seq, answer);
      if (out.status !== 200) throw new Error(out.body.error || 'answer failed');
      return out.body;
    },
  },
  {
    name: 'answer_questions',
    description: 'Answer a whole intake batch at once (up to 5 {seq, answer} pairs). One thinking per answer, one stop decision, one next batch. All-or-nothing.',
    input: { ownerWallet: '0x…', runId: 'uuid', answers: [{ seq: 0, answer: { optionIds: [], text: '' } }] },
    async run({ ownerWallet, runId, answers }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      const out = await answerIntakeBatch(run, answers);
      if (out.status !== 200) throw new Error(out.body.error || 'batch answer failed');
      return out.body;
    },
  },
  {
    name: 'configure_run',
    description: 'Set depth, budget cap, and report options once intake is done. Holds the cap against the ledger.',
    input: { ownerWallet: '0x…', runId: 'uuid', budgetCap: 2.5, depth: 'standard', liveWeb: true, language: 'en', perspective: 'neutral', formats: ['pdf'] },
    async run({ ownerWallet, runId, budgetCap, depth = 'standard', liveWeb = true, language = 'en', perspective = 'neutral', formats = ['pdf'] }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      if (!(Number(budgetCap) > 0)) throw new Error('budgetCap must be > 0');
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (run.status !== 'intake-done' && run.status !== 'planning') {
        throw new Error(`cannot configure from ${run.status}`);
      }
      const brief = { ...(run.brief || {}), depth, liveWeb, language, perspective, formats };
      await db.researchRun.update({
        where: { id: run.id },
        data: { depth, budgetCap: toDb(budgetCap), brief, status: 'planning', pauseReason: null },
      });
      const holds = await db.budgetLedger.findFirst({ where: { runId: run.id, kind: 'deposit' } });
      if (!holds) await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: toDb(budgetCap) } });
      await requestPlan(run.id);
      return { id: run.id, status: 'planning' };
    },
  },
  {
    name: 'approve_plan',
    description: 'Approve the plan and start execution. Refuses when the balance is below the plan estimate.',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (run.status !== 'planned') throw new Error(`cannot approve from ${run.status}`);
      const { balance } = await budgetState(run.id);
      const estimate = Number(run.plan?.estimate);
      if (!Number.isFinite(estimate)) throw new Error('plan has no estimate yet — wait for planning to finish');
      if (balance < estimate) throw new Error(`balance $${balance.toFixed(2)} is below the plan estimate $${estimate.toFixed(2)} — raise the cap first`);
      await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
      await requestExecute(run.id);
      return { id: run.id, status: 'running' };
    },
  },
  {
    name: 'pause_run',
    description: 'Pause a moving run. Money stays held; resume continues.',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (!['running', 'planning'].includes(run.status)) throw new Error(`cannot pause from ${run.status}`);
      await db.researchRun.update({ where: { id: run.id }, data: { status: 'paused', pauseReason: 'user' } });
      await recordEvent(run.id, { type: 'status', status: 'paused', pauseReason: 'user' });
      return { id: run.id, status: 'paused', pauseReason: 'user' };
    },
  },
  {
    name: 'resume_run',
    description: 'Resume a paused run. Refuses when the balance is empty.',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (run.status !== 'paused') throw new Error(`cannot resume from ${run.status}`);
      const { balance } = await budgetState(run.id);
      if (balance <= 0) throw new Error('out of budget — raise the cap or end the run');
      await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
      await recordEvent(run.id, { type: 'status', status: 'running' });
      await requestExecute(run.id);
      return { id: run.id, status: 'running' };
    },
  },
  {
    name: 'end_run',
    description: 'End a run: work is kept, the unspent balance is refunded immediately.',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (['ended', 'complete'].includes(run.status)) throw new Error(`run is already ${run.status}`);
      await db.researchRun.update({
        where: { id: run.id },
        data: { status: 'ended', endedAt: new Date(), pauseReason: 'user', pendingQuestion: null },
      });
      await recordEvent(run.id, { type: 'status', status: 'ended', pauseReason: 'user' });
      const money = await settle(run.id, 'ended');
      try {
        const { settleEscrowRun } = await import('../escrow/settle.js');
        await settleEscrowRun(run.id, 'ended');
      } catch {}
      return { id: run.id, status: 'ended', ...money };
    },
  },
  {
    name: 'raise_budget',
    description: 'Raise the cap (raise-only). Restarts a run parked at the cap when the balance is positive again.',
    input: { ownerWallet: '0x…', runId: 'uuid', amount: 5 },
    async run({ ownerWallet, runId, amount }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      const result = await raiseCap(run.id, Number(amount), null);
      if (!result.ok) throw new Error(result.error);
      await recordEvent(run.id, { type: 'budget.raised', cap: result.budgetCap, balance: result.balance });
      if (run.status === 'paused' && run.pauseReason === 'cap' && result.balance > 0) {
        await db.researchRun.update({ where: { id: run.id }, data: { status: 'running', pauseReason: null } });
        await recordEvent(run.id, { type: 'status', status: 'running' });
        await requestExecute(run.id);
      }
      return { id: run.id, ...result };
    },
  },
  {
    name: 'reprompt_run',
    description: 'Send a finished run again with a new prompt: bumps the version, re-executes every stage (skip is per-version), and steers the new pass with the prompt. Needs a positive balance — raise the cap first otherwise.',
    input: { ownerWallet: '0x…', runId: 'uuid', prompt: 'redo the search with shorter queries' },
    async run({ ownerWallet, runId, prompt }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (!['complete', 'failed', 'ended', 'paused'].includes(run.status)) throw new Error(`reprompt from ${run.status} — finish, fail, end, or pause the run first`);
      const text = typeof prompt === 'string' ? prompt.trim().slice(0, 2000) : '';
      const { balance } = await budgetState(run.id);
      if (!(balance > 0)) throw new Error('out of budget — raise the cap first');
      const version = run.versions + 1;
      await db.researchRun.update({
        where: { id: run.id },
        data: { versions: version, status: 'running', pauseReason: null, ...(text ? { pendingGuidance: { text } } : {}) },
      });
      await recordEvent(run.id, { type: 'status', status: 'running', version, reprompt: text ? true : undefined });
      await requestExecute(run.id);
      return { id: run.id, version, status: 'running' };
    },
  },
  {
    name: 'reconcile_run',
    description: 'Audit a run’s onchain spends: every ledger-claimed tx hash must resolve to a mined Transfer, and every agent-wallet outflow must resolve to a ledger row. Returns matches plus both directions of mismatch.',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      const { reconcileRun } = await import('../spend/reconcile.js');
      return reconcileRun(run.id);
    },
  },
  {
    name: 'get_report',
    description: 'Read the latest finished report version with citations.',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      const report = await db.researchReport.findFirst({ where: { runId: run.id }, orderBy: { version: 'desc' } });
      if (!report) throw new Error('no report yet');
      return report;
    },
  },
];
