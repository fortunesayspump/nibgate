import { researchAvailability } from '../readiness.js';
import { SOURCE_ORDER } from '../report-evidence.js';
// MCP tools — the same run flows, callable by agents.
//
// Each tool mirrors an HTTP route's contract (same ownership rule, same status
// gates, same money functions) so the two surfaces cannot disagree about what
// a run is. The one non-trivial flow — answering intake questions — is not
// mirrored but shared outright (see answer-flow.js).
//
// The MCP bearer key is a trusted service credential, not a wallet signature.
// Its holder may name any owner wallet. Keep that key inside trusted backends;
// browser users instead use the SIWE-session HTTP routes. The wallet match
// below prevents accidental cross-run access by an honest integration, but
// does not independently authenticate the named wallet.
import { db } from '../db.js';
import { applyAnswer, deriveDescription, deriveTitle, nextQuestions } from '../intake.js';
import { answerIntakeQuestion, answerIntakeBatch, createQuestion } from '../answer-flow.js';
import { budgetState, raiseCap, settle, spendable } from '../money.js';
import { jsonSafe, toDb } from '../units.js';
import { requestExecute, requestPlan } from '../worker.js';
import { isEscrowConfigured, jobStatus } from '../escrow/jobs.js';
import { recordEvent } from '../eventlog.js';
import { assertCanCreateRun } from '../limits.js';
import { resolveLength } from '../length.js';
import { attachSource, sourceSummary } from '../sources/routes.js';
import { endRun } from '../end-run.js';
import { isLegacyRun } from '../privacy/guard.js';

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
  if (!isLegacyRun(run)) return {error:'Confidential processing is unavailable on this deployment.',run:null};
  return { run };
}

async function withBudget(run) {
  const full = await db.researchRun.findUnique({
    where: { id: run.id },
    // Same trust-desc order as GET /v1/runs/:id: chip [n] is sources[n-1]
    // on every surface, including this one.
    include: { steps: { orderBy: { createdAt: 'asc' } }, sources: { orderBy: SOURCE_ORDER }, claims: true, reports: { orderBy: { version: 'desc' }, take: 1 } },
  });
  const { ledger, ...rest } = full;
  return jsonSafe({ ...rest, ...(await budgetState(run.id)) });
}

export const TOOLS = [
  {
    name:'attach_source',
    description:'Attach a private research source before the escrow job is opened or research starts. Supply name plus contentBase64 (text PDF, DOCX, XLSX, CSV, TXT, MD, or PNG/JPEG/WebP with readable English text; 2 MB each; five per project) or a public HTTPS url. Images use local OCR and require preview review for numeric errors; scanned PDFs still need OCR first. Originals use private R2; extracted text is sent to research AI providers after approval. Changing a reviewed source set invalidates the plan.',
    input:{ownerWallet:'0x…',runId:'uuid',name:'expenses.csv',contentBase64:'base64 file bytes',url:'https://example.com/source'},
    async run({ownerWallet,runId,...body}) {
      const bad=checkWallet(ownerWallet);if(bad)throw new Error(bad.error);
      const {error,run}=await ownedRun(runId,ownerWallet);if(error)throw new Error(error);
      return attachSource(run,body);
    },
  },
  {
    name:'list_supplied_sources',description:'List the owner’s attached private input files, extraction warnings and preview paths. These paths require the owner’s browser session; use read_supplied_source for authenticated agent access.',
    input:{ownerWallet:'0x…',runId:'uuid'},
    async run({ownerWallet,runId}) {
      const bad=checkWallet(ownerWallet);if(bad)throw new Error(bad.error);
      const {error}=await ownedRun(runId,ownerWallet);if(error)throw new Error(error);
      return {sources:(await db.researchStep.findMany({where:{runId,kind:'input',status:'done'},orderBy:{createdAt:'asc'}})).map(sourceSummary)};
    },
  },
  {
    name:'read_supplied_source',description:'Read a private input source’s extracted text and warnings after verifying run ownership. Returns page/sheet/row markers where available; never a public download link.',
    input:{ownerWallet:'0x…',runId:'uuid',sourceId:'uuid'},
    async run({ownerWallet,runId,sourceId}) {
      const bad=checkWallet(ownerWallet);if(bad)throw new Error(bad.error);
      const {error}=await ownedRun(runId,ownerWallet);if(error)throw new Error(error);
      const source=await db.researchStep.findFirst({where:{id:sourceId,runId,kind:'input',status:'done'}});
      if(!source)throw new Error('source not found');
      return {...sourceSummary(source),text:source.output.text};
    },
  },
  {
    name: 'create_run',
    description: 'Open a research project for a wallet when the server card research.acceptingRuns is true: creates the brief, asks the first intake question, returns the run. Include any specific public source URL in topic when it must be evaluated: the run previews named URLs for free before deciding whether a quoted x402 purchase adds enough evidence. Sending is wallet-gated like the UI composer.',
    input: { ownerWallet: '0x…', topic: 'what to research' },
    async run({ ownerWallet, topic, privacyMode }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      if (privacyMode!==undefined && privacyMode!=='legacy') throw new Error('Confidential processing is unavailable on this deployment.');
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
    description: 'Set depth, budget cap and report options after intake. Planning is free. User-sources-only research requires an attached readable source; funded execution begins only after approval. A fallback plan generated while the model is unavailable cannot be escrow-funded; configure again to retry planning.',
    input: { ownerWallet: '0x…', runId: 'uuid', budgetCap: 2.5, depth: 'standard', liveWeb: true, language: 'en', perspective: 'neutral', formats: ['pdf'], length:'standard', lengthWords:1200, tipCreators:false },
    async run({ ownerWallet, runId, budgetCap, depth = 'standard', liveWeb = true, language = 'en', perspective = 'neutral', formats = ['pdf'], length = 'standard', lengthWords = null, tipCreators = false }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      if (!(Number(budgetCap) > 0)) throw new Error('budgetCap must be > 0');
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (!['intake-done','planning','planned'].includes(run.status)) {
        throw new Error(`cannot configure from ${run.status}`);
      }
      if(liveWeb===false && !(await db.researchStep.count({where:{runId:run.id,kind:'input',status:'done'}}))) throw new Error('Attach at least one readable source before choosing user sources only.');
      const resolvedLength=resolveLength({length,lengthWords});
      const brief = { ...(run.brief || {}), depth, liveWeb, language, perspective, formats, length:resolvedLength.preset, lengthWords:resolvedLength.words, tipCreators:tipCreators===true };
      await db.researchRun.update({
        where: { id: run.id },
        data: { depth, budgetCap: toDb(budgetCap), brief, status: 'planning', pauseReason: null,metadata:{...(run.metadata||{}),planningPending:true,planRevision:(Number(run.metadata?.planRevision)||0)+1} },
      });
      const holds = await db.budgetLedger.findFirst({ where: { runId: run.id, kind: 'deposit' } });
      if (!isEscrowConfigured() && !holds) await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: toDb(budgetCap) } });
      await requestPlan(run.id);
      return { id: run.id, status: 'planning' };
    },
  },
  {
    name: 'approve_plan',
    description: 'Approve the plan and start execution. Refuses when the balance is below the plan estimate; on escrowed runs requires a Funded onchain deposit of at least the estimate (the working cap aligns to the deposit).',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      if (!researchAvailability().acceptingRuns) throw new Error('Mainnet funded research is not open yet. Try the testnet preview.');
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (run.status !== 'planned') throw new Error(`cannot approve from ${run.status}`);
      if (run.plan?.source === 'fallback') throw new Error('Planning is temporarily unavailable. Retry the plan before funding or approving this run.');
      if(run.settledAt || run.metadata?.escrow?.status==='Completed') throw new Error('This budget has settled. Start a new funded run.');
      const { balance, used } = await budgetState(run.id);
      const estimate = Number(run.plan?.estimate);
      if (!Number.isFinite(estimate)) throw new Error('plan has no estimate yet — wait for planning to finish');
      if (spendable(run.budgetCap, used) < estimate) throw new Error(`balance is below the plan estimate $${estimate.toFixed(2)} — raise the cap first`);
      // Same escrow gate as POST /:id/approve: Funded for at least the
      // estimate, working cap aligned to the deposit. An MCP approve that
      // skipped this would start an unfunded escrowed run.
      const escrow = (run.metadata && run.metadata.escrow) || null;
      if (isEscrowConfigured()) {
        if (!escrow?.jobId) throw new Error('No onchain deposit yet — fund the run escrow first, then approve.');
        const chain = await jobStatus(escrow.jobId).catch((e) => ({ error: e.message }));
        if (chain.error) throw new Error(`cannot read escrow job: ${chain.error}`);
        if (chain.status !== 'Funded') throw new Error(`escrow job ${escrow.jobId} is ${chain.status} — fund it onchain first`);
        if (!(chain.budget >= estimate)) throw new Error(`escrow holds $${chain.budget} but the plan needs $${estimate.toFixed(2)} — fund at least the estimate first`);
        await db.researchRun.update({
          where: { id: run.id },
          data: {
            budgetCap: toDb(chain.budget),
            metadata: { ...(run.metadata || {}), escrow: { ...escrow, status: 'Funded', targetCap: Number(run.budgetCap) } },
          },
        });
        const have = await db.budgetLedger.findMany({ where: { runId: run.id, kind: 'deposit' } });
        const haveTotal = have.reduce((s, r) => s + Number(r.amount), 0);
        if (chain.budget > haveTotal) {
          await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: toDb(chain.budget - haveTotal) } });
        }
      } else if (balance < estimate) {
        throw new Error(`balance $${balance.toFixed(2)} is below the plan estimate $${estimate.toFixed(2)} — raise the cap first`);
      }
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
      if(run.settledAt)throw new Error('This budget has settled. Start a fresh funded run.');
      const { balance } = await budgetState(run.id);
      if (balance <= 0 && !run.metadata?.planningPending) throw new Error('out of budget — raise the cap or end the run');
      const status=run.metadata?.planningPending ? 'planning' : 'running';
      await db.researchRun.update({ where: { id: run.id }, data: { status, pauseReason: null } });
      await recordEvent(run.id, { type: 'status', status });
      if(status==='planning')await requestPlan(run.id);else await requestExecute(run.id);
      return { id: run.id, status };
    },
  },
  {
    name: 'end_run',
    description: 'End a run and retain finished work. An active stage finishes and records its cost before the remaining balance is refunded; pending=true means settlement is still draining.',
    input: { ownerWallet: '0x…', runId: 'uuid' },
    async run({ ownerWallet, runId }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      return endRun(run.id);
    },
  },
  {
    name: 'raise_budget',
    description: 'Raise the cap (raise-only). Restarts a run parked at the cap when the balance is positive again. On escrowed runs the cap cannot pass the onchain deposit (deposits are one-shot).',
    input: { ownerWallet: '0x…', runId: 'uuid', amount: 5 },
    async run({ ownerWallet, runId, amount }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      // Same escrow gate as POST /:id/budget: raising past the deposit
      // would book money the chain never saw.
      const escrow = (run.metadata && run.metadata.escrow) || null;
      if (escrow?.jobId && isEscrowConfigured()) {
        const chain = await jobStatus(escrow.jobId).catch((e) => ({ error: e.message }));
        if (chain.error) throw new Error(`cannot read escrow job: ${chain.error}`);
        if (!(chain.budget >= Number(amount))) {
          throw new Error(`escrow holds $${chain.budget} on a Funded job — deposits are one-shot, so the cap cannot pass $${chain.budget} on this run. End it and start a new run for a bigger budget`);
        }
      }
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
    description: 'Restart an unsettled paused run with a new prompt and report version. Refunded budgets cannot be reused: start and fund a fresh project after settlement. An active stage must finish first.',
    input: { ownerWallet: '0x…', runId: 'uuid', prompt: 'redo the search with shorter queries' },
    async run({ ownerWallet, runId, prompt }) {
      const bad = checkWallet(ownerWallet);
      if (bad) throw new Error(bad.error);
      const { error, run } = await ownedRun(runId, ownerWallet);
      if (error) throw new Error(error);
      if (!['complete', 'failed', 'ended', 'paused'].includes(run.status)) throw new Error(`reprompt from ${run.status} — finish, fail, end, or pause the run first`);
      if(run.settledAt || run.metadata?.escrow?.status==='Completed') throw new Error('This budget has settled. Start a new funded run.');
      if(await db.researchStep.count({where:{runId,status:'active'}})) throw new Error('Wait for the current stage to finish before restarting.');
      const text = typeof prompt === 'string' ? prompt.trim().slice(0, 2000) : '';
      const { balance } = await budgetState(run.id);
      if (!(balance > 0)) throw new Error('out of budget — raise the cap first');
      const version = run.versions + 1;
      const versionPrompts = { ...((run.metadata || {}).versionPrompts || {}) };
      if (text) versionPrompts[version] = text;
      await db.researchRun.update({
        where: { id: run.id },
        data: { versions: version, status: 'running', pauseReason: null, metadata: { ...(run.metadata || {}), versionPrompts }, ...(text ? { pendingGuidance: { text } } : {}) },
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
