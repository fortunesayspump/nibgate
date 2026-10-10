// FIRST import: env.js must populate process.env before db.js builds a client.
import './env.js';

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { recordEvent } from './eventlog.js';
import { enqueue } from './queue.js';
import { budgetState, draw, settle } from './money.js';
import { generatePlan, generateReport, generateReportLong, generateRoundReview } from './llm/generate.js';
import { resolveLength } from './length.js';
import { searchEvidence } from './tools/evidence.js';
import { runChoice, runNoul, runGrade } from './jev/decisions.js';
import { dedupeByUrl, mapLimit } from './retrieval/index.js';
import { runTool } from './tools/executor.js';
import { isSpendConfigured } from './spend/policy.js';
import { destroySandbox, destroyAllSandboxes, sandboxConfigured } from './tools/sandbox.js';
import { depthLimits } from './depth.js';
import { memoryPriors, recordRunMemory } from './memory.js';
import { chat, isLlmConfigured } from './llm/provider.js';

const STAGE_COSTS = { plan: 0.02, search: 0.03, fetch: 0.06, data: 0.04, score: 0.02, write: 0.09 };

// Plan pricing. An estimate is a promise about money, so the formula is
// stated, not hidden: one full pipeline pass at table rates, scaled by depth
// (more rounds, more sources) and report length (more sections to write),
// plus one search round per sub-question beyond the first two the base pass
// already covers. It is deliberately conservative — an estimate that comes in
// high gets refunded on settle; one that comes in low pauses the run mid-way.
const DEPTH_COST_FACTOR = { quick: 0.5, standard: 1, deep: 2 };

export function estimatePlanCost({ subQuestions = [], depth = 'standard', lengthWords = 4000 } = {}) {
  const pass = STAGE_COSTS.plan + STAGE_COSTS.search + STAGE_COSTS.fetch + STAGE_COSTS.score + STAGE_COSTS.write;
  const depthFactor = DEPTH_COST_FACTOR[depth] ?? 1;
  const extraQuestions = Math.max(0, subQuestions.length - 2);
  const lengthFactor = Math.max(0.5, (Number(lengthWords) || 4000) / 4000);
  return Math.round((pass * depthFactor * lengthFactor + extraQuestions * STAGE_COSTS.search) * 100) / 100;
}

// Crash-recovery lease. A step holds a lease while it runs and renews it on a
// heartbeat; a step still `active` after its lease expired belongs to a dead
// worker, and the boot sweeper reclaims it. The lease is generous on purpose —
// a slow stage (long model call, big crawl) must never look dead — and the
// heartbeat keeps it alive for as long as work is actually happening.
export const WORKER_ID = `${os.hostname()}-${process.pid}-${Date.now().toString(36)}`;
export const LEASE_MS = Number(process.env.DRNIB_STAGE_LEASE_MS || 15 * 60 * 1000);
const HEARTBEAT_MS = Math.min(60_000, Math.max(10_000, Math.floor(LEASE_MS / 10)));

// In-flight stages in this process, for graceful shutdown: SIGTERM waits for
// the current calls to finish (they checkpoint on completion) instead of
// abandoning them mid-stage.
let inFlight = 0;
export function inFlightSteps() { return inFlight; }

// A parked run must not keep spending. `awaiting` counts as parked: the run
// stopped to ask the user something, and money does not move while it waits.
const PARKED = new Set(['paused', 'awaiting', 'ended', 'failed', 'complete']);

const loadRun = (runId) => db.researchRun.findUniqueOrThrow({ where: { id: runId } });

async function park(runId, status, reason = null) {
  const run = await db.researchRun.update({ where: { id: runId }, data: { status, pauseReason: reason } });
  await recordEvent(runId, { type: status === 'complete' ? 'complete' : 'status', status, pauseReason: reason });
  return run;
}

export async function halt(runId) {
  const run = await loadRun(runId);
  if (!PARKED.has(run.status)) return false;
  if (run.status === 'paused' && run.pauseReason !== 'user') {
    await recordEvent(runId, { type: 'status', status: run.status, pauseReason: run.pauseReason });
  }
  return true;
}

// Guidance typed while a stage is running is held here and picked up at the
// next stage boundary, so a stage never reads half-written input.
async function takeGuidance(runId) {
  const run = await loadRun(runId);
  if (!run.pendingGuidance) return null;
  await db.researchRun.update({ where: { id: runId }, data: { pendingGuidance: null } });
  await recordEvent(runId, { type: 'guidance.applied', guidance: run.pendingGuidance });
  return run.pendingGuidance;
}

export async function parkForQuestion(runId, question) {
  await db.researchRun.update({
    where: { id: runId },
    data: { status: 'awaiting', pendingQuestion: question, pauseReason: 'awaiting' },
  });
  await recordEvent(runId, { type: 'awaiting', question });
  return question;
}

// Stages are keyed by (kind, attempt) where attempt is the run's version, so a
// resume continues from the last finished stage while a revision starts clean.
// Each stage holds a crash-recovery lease (see WORKER_ID above): it renews on
// a heartbeat while work is happening, and a boot sweeper reclaims anything
// left `active` past its lease.
//
// The skip path reports `skipped: true` so callers never charge for work that
// already happened: without it, resuming a run would draw the stage cost a
// second time for the same step.
async function stage(runId, kind, version, fn) {
  const done = await db.researchStep.findFirst({
    where: { runId, kind, attempt: version, status: 'done' },
    orderBy: { createdAt: 'desc' },
  });
  if (done) {
    await recordEvent(runId, { type: 'step.skipped', kind, reason: 'already done' });
    return { ...(done.output ?? {}), skipped: true };
  }
  const row = await db.researchStep.create({
    data: {
      runId, kind, status: 'active', attempt: version, startedAt: new Date(),
      workerId: WORKER_ID, leaseUntil: new Date(Date.now() + LEASE_MS), heartbeatAt: new Date(),
    },
  });
  await recordEvent(runId, { type: 'step.started', kind });
  inFlight += 1;
  const heartbeat = setInterval(() => {
    db.researchStep.update({
      where: { id: row.id },
      data: { heartbeatAt: new Date(), leaseUntil: new Date(Date.now() + LEASE_MS) },
    }).catch(() => {});
  }, HEARTBEAT_MS);
  try {
    const started = Date.now();
    const out = await fn();
    const elapsedMs = Date.now() - started;
    console.log(`[dr-nib] stage=${kind} run=${runId} elapsed=${elapsedMs}ms`);
    // Narrate, never block: one voiced line lands in the feed seconds later.
    announce(runId, kind, out);
    await db.researchStep.update({
      where: { id: row.id },
      data: { status: 'done', output: out ?? {}, endedAt: new Date() },
    });
    await recordEvent(runId, { type: 'step.finished', kind });
    return out;
  } catch (error) {
    await db.researchStep.update({
      where: { id: row.id },
      data: { status: 'failed', output: { error: error.message }, endedAt: new Date() },
    });
    await recordEvent(runId, { type: 'failed', kind, error: error.message });
    await park(runId, 'failed', 'error');
    throw error;
  } finally {
    clearInterval(heartbeat);
    inFlight -= 1;
  }
}

// ── Stage narration ─────────────────────────────────────────────────────────
// The run talks while it works: one plain-words line per finished stage —
// what it found, what happens next — so the owner follows along like a chat.
// Voice only (facts ride in, the model phrases); fire-and-forget so a missing
// line never slows the pipeline.
const STAGE_NEXT = {
  plan: 'searching the web for each question',
  search: 'opening the best hits and reading them',
  fetch: 'judging which sources to trust',
  data: 'judging which sources to trust',
  score: 'writing the report from the trusted sources',
  write: 'settling the budget and releasing the remainder',
};

function factsFor(kind, out = {}) {
  const o = out || {};
  if (kind === 'plan') {
    const n = (o.sub_questions || []).length;
    return `${n} research question${n === 1 ? '' : 's'} planned`;
  }
  if (kind === 'search') {
    const failed = (o.providers || []).filter((p) => p && p.ok === false).map((p) => p.name).join(', ');
    return `${o.hits ?? 0} hits across ${(o.queries || []).length} searches${failed ? ` (${failed} unreachable)` : ''}`;
  }
  if (kind === 'fetch') return `${o.pages ?? 0} pages read`;
  if (kind === 'data') return `${(o.documents || []).length} direct documents, ${(o.calls || []).length} calls`;
  if (kind === 'score') return `${o.scored ?? 0} sources scored for trust`;
  if (kind === 'write') return `report v${o.version ?? 1} written`;
  return '';
}

async function announce(runId, kind, out) {
  try {
    const { generateStageNote } = await import('./llm/generate.js');
    const text = await generateStageNote({ kind, facts: factsFor(kind, out), next: STAGE_NEXT[kind] });
    if (text) await recordEvent(runId, { type: 'thinking', phase: `stage-${kind}`, text });
  } catch {}
}

// ── Orphan sweep ─────────────────────────────────────────────────────────────
// Runs at boot, in every process that can execute stages. Anything still
// `active` past its lease belonged to a worker that died mid-stage: reset it
// to `pending` (the row stays as an audit scar) and re-enqueue the run so the
// pipeline replays from the last finished stage. Only runs that are actually
// supposed to be moving are requeued — a paused run stays paused, an ended run
// stays ended; resuming those is the owner's call, not the sweeper's.
const REQUEUEABLE = new Set(['planning', 'running']);

export async function findOrphans(now = new Date()) {
  return db.researchStep.findMany({
    where: { status: 'active', leaseUntil: { lt: now } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function requeueOrphans({ enqueueFn = enqueue } = {}) {
  const orphans = await findOrphans();
  if (!orphans.length) return { reclaimed: 0, runs: [] };
  const runIds = [...new Set(orphans.map((o) => o.runId))];
  const runs = await db.researchRun.findMany({ where: { id: { in: runIds } } });
  const requeued = [];
  for (const run of runs) {
    await db.researchStep.updateMany({
      where: { runId: run.id, status: 'active', leaseUntil: { lt: new Date() } },
      data: { status: 'pending', workerId: null, leaseUntil: null },
    });
    await recordEvent(run.id, { type: 'step.reclaimed', reason: 'worker lost mid-stage; replaying from the last finished step' });
    if (!REQUEUEABLE.has(run.status)) continue;
    if (run.status === 'planning') await enqueueFn('run.plan', { runId: run.id });
    else await enqueueFn('run.execute', { runId: run.id });
    requeued.push(run.id);
  }
  return { reclaimed: orphans.length, runs: requeued };
}

// ── Stalled-run sweep ─────────────────────────────────────────────────────────
// The orphan sweep only sees steps stuck `active`. A run can also strand with
// NO active step: the driver died between stages (or between the last stage
// and the next decision), so nothing is leased and nothing is queued, and the
// run sits `running` forever. This sweep runs at boot and re-enqueues every
// `running` run that has no stage in flight and has been quiet for a while —
// stages skip when already done, so replaying from the last finished stage is
// safe. Out-of-budget runs park at the cap instead (resume handles them);
// anything not `running` is the owner's call, never the sweeper's.
export async function requeueStalledRuns({ enqueueFn = enqueue, olderThanMs = 120_000 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stuck = await db.researchRun.findMany({
    where: { status: 'running', updatedAt: { lt: cutoff }, deletedAt: null },
    select: { id: true },
  });
  const kicked = [];
  for (const { id } of stuck) {
    const active = await db.researchStep.count({ where: { runId: id, status: 'active' } });
    if (active) continue; // a stage is genuinely moving; leave it alone
    const { balance } = await budgetState(id);
    if (!(balance > 0)) {
      await park(id, 'paused', 'cap');
      continue;
    }
    await db.researchRun.update({ where: { id }, data: { updatedAt: new Date() } });
    await recordEvent(id, { type: 'status', status: 'running', note: 'requeued: backend restarted with no stage in flight' });
    await enqueueFn('run.execute', { runId: id });
    kicked.push(id);
  }
  return { kicked };
}

// Charge the stage, or park at the cap rather than overspending. The balance
// stays intact and the owner decides: raise the cap or end.
//
// The amount is the real cost the stage incurred when the LLM reported one
// (`actualCost`), otherwise the price-table estimate for the stage. Metering
// the actual number is what keeps a run's ledger honest once calls are live.
async function charge(runId, kind, actualCost) {
  const amount = Number.isFinite(actualCost) && actualCost > 0 ? actualCost : STAGE_COSTS[kind];
  const result = await draw(runId, amount);
  const run = await loadRun(runId);
  await recordEvent(runId, {
    type: 'budget.tick',
    kind,
    cost: amount,
    used: result.used,
    balance: result.balance,
    cap: run.budgetCap,
  });
  if (!result.ok) await park(runId, 'paused', 'cap');
  return result.ok;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────
// Real providers (retrieval) and the router (generation) sit behind metered
// interfaces. When a provider is not configured the stage falls back to a
// deterministic stand-in so the API, SSE, budget, and lifecycle contracts stay
// exercisable offline — the fallback is labelled, never passed off as real.

const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
};

// Domain policy for tool calls, read from the run's brief when the configure
// screen's Advanced drawer set it. Absent lists mean allow-all; an explicit
// deny always wins (see tools/policy.js).
const briefPolicy = (run) => ({
  allow: run.brief?.domainsAllow || [],
  deny: run.brief?.domainsDeny || [],
});

// Search stage: turn the approved sub-questions into queries, fan them across
// every available provider — keyed breadth plus the free academic index — dedupe,
// and persist the candidates. `attempted` distinguishes "the web was asked and
// said nothing" from "nothing was asked" (fully offline); only the latter may
// ever use placeholder sources downstream.
//
// Each query goes through the tool executor, so every search is policy-checked,
// metered, and written to the run's audit trail as a tool.call.
const QUERY_STOPWORDS = new Set(
  'what,are,the,and,for,over,last,with,from,that,this,how,they,does,between,into,under,more,most,such,than,then,when,which,while,about,based,using,used,each,have,has,had,been,were,was,but,not,all,any,can,its,per,does,doing,either,also,other,than,those,these,there,their,them,they,will,would,should,could,been,being,doing,down,during,does,doing'.split(','),
);

// Sub-questions are report prose ("What are the median fees…?"); most free
// indexes want keywords, not sentences. Reduce to significant tokens (numbers
// always survive: "90 days", "$1" carry the question) so arXiv-all-style
// backends match instead of returning empty on a 30-word sentence.
function keywordQuery(q) {
  const tokens = String(q || '').toLowerCase().replace(/[^a-z0-9$€£¥.\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const kept = tokens.filter((w) => /\d/.test(w) || (w.length > 2 && !QUERY_STOPWORDS.has(w)));
  const short = kept.slice(0, 12).join(' ').trim();
  return short || String(q || '').trim();
}

async function searchStage(runId, run, queries) {
  const brief = run.brief || {};
  const limits = depthLimits(brief.depth);
  const list = (Array.isArray(queries) && queries.length ? queries : [brief.topic || 'the brief']).slice(0, limits.queries).map(keywordQuery);

  const settled = [];
  let costUsd = 0;
  const providers = [];
  let attempted = false;
  // Queries are independent: fan them out together. The old serial loop
  // multiplied every slow provider by the query count (standard = 4x).
  const perQuery = await Promise.all(list.map((query) => runTool(runId, 'web_search', {
    query,
    maxResults: 6,
    searchDepth: brief.depth === 'deep' ? 'advanced' : 'basic',
    includeContent: true,
  }, { policy: briefPolicy(run) })));
  for (const called of perQuery) {
    const out = called.output || {};
    if (!out.fallback) attempted = true;
    settled.push(...(out.results || []));
    costUsd += called.costUsd;
    providers.push(...(out.providers || []));
  }
  if (!attempted) {
    return {
      why: 'No retrieval provider could be reached, so the run cannot touch the web. This is a labelled offline stub.',
      queries: list,
      hits: 0,
      costUsd: 0,
      providers,
      attempted: false,
      fallback: true,
      results: [],
    };
  }
  const results = dedupeByUrl(settled).slice(0, 40);
  return {
    why: 'Fanning the sub-questions across the available providers — keyed breadth plus the free academic index — then collapsing duplicate URLs before reading anything.',
    queries: list,
    hits: results.length,
    costUsd,
    providers,
    attempted: true,
    fallback: false,
    results,
  };
}

// Fetch stage: select the candidate passages worth reading. Where a provider
// returned only a thin snippet, extract the full text through the web_fetch
// tool (metered extractor when configured, otherwise the free direct path).
// Robots and paywalls are respected; skipped URLs are reported, not worked
// around. Every enrichment is a logged tool call.
async function fetchStage(runId, run) {
  const limits = depthLimits(run.brief?.depth);
  const search = await db.researchStep.findFirst({
    where: { runId, kind: 'search' },
    orderBy: { createdAt: 'desc' },
  });
  const results = search?.output?.results || [];
  const attempted = search?.output?.attempted === true;
  if (!results.length) {
    return {
      why: attempted
        ? 'The providers returned no candidates, so there is nothing to read. The report will say the evidence does not cover the brief.'
        : 'Nothing to read: no retrieval results were collected.',
      documents: [],
      pages: 0,
      costUsd: 0,
      attempted,
      fallback: !attempted,
    };
  }
  // Read in score order, not bench order: provider scores exist to rank, and
  // the bench emits academic indexes before web search. Slicing pre-sort
  // starves high-signal web hits (searxng 0.6) behind low-signal papers
  // (academic 0.5) — seen live: 6 on-topic web hits unfetched while 4
  // irrelevant papers became the whole evidence set. Stable sort keeps
  // ties in bench order.
  const ranked = [...results].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const thin = ranked.slice(0, limits.fetchDocs).filter((r) => (r.content || '').trim().length < 500);
  const enriched = new Map();
  let extractCost = 0;
  if (thin.length) {
    const fetched = await runTool(runId, 'web_fetch', { urls: thin.map((r) => r.url) }, { policy: briefPolicy(run) });
    extractCost = fetched.costUsd;
    for (const d of fetched.output?.documents || []) enriched.set(d.url, d);
  }
  const documents = ranked.slice(0, limits.fetchDocs).map((r) => {
    const full = (r.content || '').trim().length >= 500 ? r.content : (enriched.get(r.url)?.text || r.content || r.snippet || '');
    return {
      url: r.url,
      title: r.title || '',
      text: full,
      relevance: Number(r.score) || 0,
      provider: r.provider,
      image: enriched.get(r.url)?.image || r.image || null,
    };
  });
  return {
    why: 'Opening the ranked results and keeping the passages that carry claims; paywalled, blocked, and empty pages are reported as skipped, never scraped around.',
    documents,
    pages: documents.length,
    costUsd: extractCost,
    attempted: true,
    fallback: false,
  };
}

// Trust criteria are proposed per run, not hardcoded: what counts as credible
// evidence depends on the question (a filing for finance, a paper for science,
// a primary document for history). The model drafts the criteria; JEV applies
// them per source. Cached per run, with a static fallback when no model is
// configured — and the fallback is visibly generic rather than pretending to
// be tailored.
const trustCriteriaCache = new Map();
async function trustCriteria(run) {
  if (trustCriteriaCache.has(run.id)) return trustCriteriaCache.get(run.id);
  let criteria = 'a primary source, filing, paper, or reputable outlet. Marketing pages, content farms, and SEO filler score low.';
  if (isLlmConfigured()) {
    try {
      const { text } = await chat({
        effort: 'low',
        messages: [
          { role: 'system', content: 'Reply with 3-5 short trust criteria, one per line, no preamble.' },
          { role: 'user', content: `Research topic: ${run.brief?.topic || 'the brief'}\n\nWhat makes a web source credible evidence for this topic? List the criteria a judge should apply.` },
        ],
        temperature: 0.3,
        maxTokens: 300,
      });
      if (text?.trim()) criteria = text.trim().slice(0, 800);
    } catch {}
  }
  if (trustCriteriaCache.size > 500) trustCriteriaCache.clear();
  trustCriteriaCache.set(run.id, criteria);
  return criteria;
}

// Direct-data stage: when retrieval came back thin, the model reaches for
// primary sources itself — public HTTP APIs, sandbox compute when the
// deployment offers it. Bounded (3 calls max) and fully inside the tool
// executor, so policy, metering, and the audit trail apply exactly as they do
// to stage-driven calls. Results join the evidence set; scoreStage still puts
// every one of them past JEV trust.
async function dataStage(runId, run, queries) {
  const fetchStep = await db.researchStep.findFirst({
    where: { runId, kind: 'fetch' },
    orderBy: { createdAt: 'desc' },
  });
  const have = (fetchStep?.output?.documents || []).length;
  if (have >= 3) {
    return { skipped: true, why: 'Retrieval already delivered enough to judge; no direct calls needed.', calls: [], documents: [] };
  }
  if (!isLlmConfigured()) {
    return { skipped: true, why: 'Model unconfigured: nobody to propose direct calls.', calls: [], documents: [] };
  }
  const available = ['http_request'];
  if (sandboxConfigured()) available.push('run_code');
  // Money, when the deployment gave the agent a wallet: the model may reach
  // for paid sources and tip decisive creators, inside per-call ceilings and
  // the run's own balance. No key, no spend tools — the prompt says so too.
  if (isSpendConfigured()) available.push('tip_creator', 'unlock_content', 'pay_x402');
  // The full loop, not a bare proposal: every call is schema-checked,
  // JEV-judged (execute/skip/answer with reasons), executed, and observed —
  // the same propose→judge→execute contract as the standalone agent.
  const { budgetState: state } = await import('./money.js');
  const { balance } = await state(runId);
  const { runToolAgent } = await import('./agent/loop.js');
  const agent = await runToolAgent({
    task: `Gather primary evidence the web search missed for: ${run.brief?.topic || 'the brief'}\nThin queries were:\n${queries.map((q) => `- ${q}`).join('\n')}`,
    tools: available,
    maxSteps: 3,
    runId,
    policy: briefPolicy(run),
    balanceUsd: balance,
  });
  const calls = [];
  const documents = [];
  let costUsd = 0;
  let n = 0;
  for (const s of agent.steps) {
    if (!s.proposal?.tool || !s.result || s.result.skipped) {
      if (s.proposal?.tool) calls.push({ tool: s.proposal.tool, ok: false, why: s.proposal.why, error: `judged ${s.judgement.decision}`, judgement: s.judgement.decision });
      continue;
    }
    n += 1;
    costUsd += s.result.costUsd || 0;
    // Onchain spends keep their receipts on the step: the ledger records the
    // dollars via charge(), the tx hash lives here and in the tool.call event.
    calls.push({
      tool: s.proposal.tool, ok: s.result.ok, why: s.proposal.why,
      error: s.result.ok ? undefined : s.result.error,
      txHash: s.result.output?.txHash || undefined,
      judgement: s.judgement.decision,
    });
    if (s.result.ok) {
      const doc = toDirectDocument(n - 1, { tool: s.proposal.tool, input: s.proposal.input }, s.result.output);
      if (doc) documents.push(doc);
    }
  }
  if (!calls.length && !agent.stopped) {
    return {
      skipped: true, why: 'No direct calls proposed — the evidence set stays as retrieval left it.',
      calls: [], documents: [],
    };
  }
  return {
    why: documents.length
      ? 'Retrieval came back thin, so the run asked primary sources directly; every result below still faces JEV trust.'
      : 'Direct calls went out but returned nothing usable.',
    calls, documents, costUsd, attempted: true, fallback: false,
    source: 'agent-loop', steps: agent.steps.length,
  };
}

// One tool result becomes one scorable document. Text is capped: the report
// cites from excerpts, and a 2MB API dump must never ride the ledger or the
// prompt.
function toDirectDocument(n, call, output) {
  if (call.tool === 'http_request') {
    const body = typeof output?.body === 'string' ? output.body : JSON.stringify(output?.body ?? '');
    if (!body.trim()) return null;
    let title = 'API response';
    try {
      const u = new URL(call.input?.url || '');
      title = `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 120);
    } catch {}
    return { url: String(call.input?.url || ''), title, text: body.slice(0, 8000), relevance: 0.5, provider: 'direct' };
  }
  if (call.tool === 'run_code') {
    const stdout = String(output?.stdout || '');
    if (!stdout.trim()) return null;
    return {
      url: `sandbox://run/${n}`,
      title: String(call.input?.command || call.input?.code || 'sandbox computation').slice(0, 120),
      text: stdout.slice(0, 8000), relevance: 0.5, provider: 'direct',
    };
  }
  // Paid content becomes evidence like anything else: the unlock/pay tools
  // return their body, which joins the scorable set (JEV still judges it).
  // Tips buy goodwill, not evidence — receipt only, no document.
  if (call.tool === 'unlock_content' || call.tool === 'pay_x402') {
    const text = typeof output?.text === 'string' && output.text.trim()
      ? output.text
      : JSON.stringify(output?.data ?? '');
    if (!text.trim()) return null;
    let title = 'Paid content';
    try {
      const u = new URL(call.input?.url || '');
      title = `Paid: ${u.hostname}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 120);
    } catch {}
    return { url: String(call.input?.url || ''), title, text: text.slice(0, 8000), relevance: 0.5, provider: 'direct' };
  }
  return null;
}

// Score stage: keep relevance and trust as separate axes. Relevance comes from
// the retrieval ranking; trust is a JUDGEMENT, so it goes to JEV — one calibrated
// probability per source. If JEV is unavailable the run parks (never guesses).
async function scoreStage(runId, run) {
  const limits = depthLimits(run.brief?.depth);
  const fetchStep = await db.researchStep.findFirst({
    where: { runId, kind: 'fetch' },
    orderBy: { createdAt: 'desc' },
  });
  const dataStep = await db.researchStep.findFirst({
    where: { runId, kind: 'data', status: 'done' },
    orderBy: { createdAt: 'desc' },
  });
  // Direct-call evidence joins the retrieved set before judging: an API
  // response or sandbox computation is scored by JEV on the same axes, never
  // smuggled past trust.
  const documents = [...(fetchStep?.output?.documents || []), ...(dataStep?.output?.documents || [])];
  const attempted = fetchStep?.output?.attempted === true || (dataStep?.output?.attempted === true && (dataStep?.output?.documents || []).length > 0);

  // Placeholder sources exist for exactly one reason: the web was never asked
  // (fully offline). A genuine empty result is reported as empty — inventing
  // sources to fill it would be fabrication, and the report prompt already
  // knows how to say the evidence does not cover the brief.
  if (!documents.length && !attempted) {
    await db.researchSource.createMany({
      data: [
        { runId, url: 'https://example.com/a', title: 'Example source A', domain: 'example.com', relevance: 0.9, trust: 0.8 },
        { runId, url: 'https://example.com/b', title: 'Example source B', domain: 'example.com', relevance: 0.7, trust: 0.5 },
      ],
      skipDuplicates: true,
    });
    return { why: 'Offline stub: example sources stand in because no retrieval was attempted.', scored: 2, fallback: true };
  }

  if (!documents.length) {
    return { why: 'The providers returned no readable candidates, so there is nothing to score. The report will say so.', scored: 0, costUsd: 0, fallback: false };
  }

  const top = documents.slice(0, limits.scoreTop);
  const criteria = await trustCriteria(run);
  const priors = await memoryPriors(run.userId, top.map((d) => domainOf(d.url)));
  // Sources are independent: judge up to 4 at once. The old serial loop did
  // 2 hub round-trips per source back to back (standard = 16 in a row).
  const judged = await mapLimit(top, 4, async (doc) => {
    const prior = priors[domainOf(doc.url)];
    const history = prior ? ` User history: cited in ${prior.cites} of ${prior.reads} past runs.` : '';
    const trust = await runNoul(runId, {
      step: 'source-trust',
      prompt: `Is this source trustworthy for the question? ${doc.url}`,
      state: `Topic: ${run.brief?.topic || ''}\nURL: ${doc.url}\nTitle: ${doc.title}\nExcerpt: ${String(doc.text || '').slice(0, 800)}`,
      instructions: `Probability (0..1) that this source is credible evidence for the topic. Trust a source that meets these criteria: ${criteria}${history}`,
    });
    if (!trust) return { parked: true };
    // Evidence grade (Score primitive): where this source falls on the
    // quality scale. Ranks, never gates — JEV down means ungraded, and the
    // run proceeds on trust alone.
    let gradeScore = null;
    let gradeCost = 0;
    try {
      const g = await runGrade(runId, {
        step: 'source-grade',
        prompt: `Grade this source's evidence quality for the question. ${doc.url}`,
        state: `Topic: ${run.brief?.topic || ''}\nURL: ${doc.url}\nTitle: ${doc.title}\nExcerpt: ${String(doc.text || '').slice(0, 800)}`,
        instructions: 'Grade the evidence quality of this source for the topic.',
        levels: [
          'Passing mention, directory listing, or SEO filler — no substantive content',
          'Topical article with real content but secondary reporting',
          'Substantive primary reporting, data, or analysis',
          'Primary source: paper, filing, official docs, or direct measurement',
        ],
        questionId: 'source-grade',
      });
      if (g) {
        gradeScore = g.score;
        gradeCost = Number(g.usage?.costUsd) || 0;
      }
    } catch {}
    return { doc, trust: trust.probability, grade: gradeScore, cost: (Number(trust.usage?.costUsd) || 0) + gradeCost };
  });
  const scored = [];
  let jevCost = 0;
  for (const j of judged) {
    if (j.parked) return { why: 'Parked: JEV is unreachable, so trust cannot be judged.', scored: scored.length, fallback: false, parked: true };
    jevCost += j.cost;
    scored.push({ ...j.doc, trust: j.trust, grade: j.grade });
  }

  // Primary sources first: grade ranks within equal trust.
  scored.sort((a, b) => (Number(b.grade ?? -1) - Number(a.grade ?? -1)) || ((b.trust ?? 0) - (a.trust ?? 0)));

  await db.researchSource.createMany({
    data: scored.map((d) => ({
      runId,
      url: d.url,
      title: d.title || null,
      domain: domainOf(d.url),
      relevance: d.relevance,
      trust: d.trust,
      cost: 0,
    })),
    skipDuplicates: true,
  });
  return {
    why: 'Relevance from retrieval ranking; trust decided by JEV per source, so an on-topic content farm cannot count as evidence.',
    scored: scored.length,
    costUsd: jevCost,
    fallback: false,
  };
}

// FLOW.md requires it, so it is enforced structurally rather than left to the
// prompt: reports on finance, medicine, or law carry a short notice that the
// work is research, not advice. Keyword matching over-matches by design — a
// notice that appears unnecessarily is harmless; one that fails to appear is
// a compliance miss. Ordinary reports never see it.
const SENSITIVE_TOPIC = /(financ|invest|funds?|stock|trading|portfolio|retire|mortgage|loan|debt|credit|bank|medic|health|drug|pharma|law|legal|tax|insur|diagnos|therap|surgery|mental health)/i;
export const RESEARCH_NOT_ADVICE =
  '> Note: this is research, not advice. It cites what the evidence supports; it does not tell you what to buy, take, or sign.';

export function ensureAdviceNotice(markdown, topic) {
  if (!SENSITIVE_TOPIC.test(String(topic || ''))) return markdown;
  if (String(markdown || '').includes('not advice')) return markdown;
  return `${RESEARCH_NOT_ADVICE}\n\n${markdown}`;
}

async function writeStage(runId, run, guidance) {
  const sources = await db.researchSource.findMany({
    where: { runId },
    orderBy: [{ trust: 'desc' }, { relevance: 'desc' }],
    take: 40,
  });
  // Attach the passage each source contributed, so the report prompt is bound to
  // what was actually read rather than to titles alone.
  const fetchStep = await db.researchStep.findFirst({
    where: { runId, kind: 'fetch' },
    orderBy: { createdAt: 'desc' },
  });
  const docsByUrl = new Map((fetchStep?.output?.documents || []).map((d) => [d.url, d]));
  const brief = run.brief || {};
  const evidence = sources.map((s) => ({
    url: s.url,
    title: s.title,
    domain: s.domain,
    relevance: s.relevance,
    trust: s.trust,
    excerpt: docsByUrl.get(s.url)?.text || '',
  }));
  // Brief length stays a single bounded call; anything longer is written
  // section by section, each from its own evidence, then assembled.
  //
  // Live writing: section tokens stream to the feed batched every ~250ms
  // (per-section streams, so parallel sections never garble). Ephemeral —
  // the persisted report is the record; tokens are the show.
  const { publish } = await import('./events.js');
  const stream = `write-v${run.versions}`;
  const tokenBuf = new Map();
  const flushTokens = () => {
    for (const [key, buf] of tokenBuf) {
      if (!buf.text) continue;
      publish(runId, { type: 'token', stream, section: buf.section, of: buf.of, delta: buf.text });
      buf.text = '';
    }
  };
  let tokenTimer = null;
  const emitToken = (delta, { section = 0, of = 0 } = {}) => {
    const key = `${section}/${of}`;
    if (!tokenBuf.has(key)) tokenBuf.set(key, { section, of, text: '' });
    tokenBuf.get(key).text += String(delta || '');
    if (!tokenTimer) tokenTimer = setTimeout(() => { tokenTimer = null; flushTokens(); }, 250);
  };
  const resolved = resolveLength({ length: brief.length, lengthWords: brief.lengthWords });
  const generated = resolved.preset === 'brief'
    ? await generateReport({ brief, sources: evidence, guidance, runId, version: run.versions, onToken: (d) => emitToken(d) })
    : await generateReportLong({
        brief,
        sections: (run.plan?.sub_questions?.length ? run.plan.sub_questions : [`Report on: ${brief.topic || 'the brief'}`]),
        getEvidence: async (section) => {
          const found = await searchEvidence(runId, { query: section, limit: 6 });
          return found.matches.map((m) => {
            const doc = docsByUrl.get(m.url);
            return { url: m.url, title: m.title, excerpt: m.excerpt || doc?.text?.slice(0, 600) || '' };
          });
        },
        guidance,
        runId,
        version: run.versions,
        onToken: (d, meta) => emitToken(d, meta),
      });
  if (tokenTimer) { clearTimeout(tokenTimer); tokenTimer = null; }
  flushTokens();
  await recordEvent(runId, {
    type: generated.source === 'llm' ? 'thinking' : 'thinking.fallback',
    phase: 'write',
    text: generated.source === 'llm'
      ? 'Writing only from the scored passages; unsupported claims are marked, not asserted.'
      : 'Writing offline: the report is a placeholder until the model is configured.',
  });
  await db.researchReport.create({
    data: { runId, version: run.versions, markdown: ensureAdviceNotice(generated.markdown, run.brief?.topic), citations: [] },
  });
  // Memory is a side record, never load-bearing: a failure here must not fail
  // the run it is trying to learn from.
  try {
    await recordRunMemory(runId);
  } catch (err) {
    await recordEvent(runId, { type: 'memory.failed', error: String(err?.message || err).slice(0, 200) });
  }
  return {
    why: 'Synthesizing only from scored passages; every claim carries a citation or is marked Unknown.',
    version: run.versions,
    source: generated.source,
    model: generated.model,
    llmError: generated.llmError || null,
    llmCost: generated.usage?.costUsd ?? null,
  };
}

// Gratitude stage: tip the decisive sources, when the owner opted in at
// configure. The tip_creator rail resolves any creator page to a payee; the
// agent loop proposes, JEV judges every call (money always goes to JEV), and
// the existing per-call ceiling + run-balance gates bound it. Skipped unless
// opted in — spending the owner's money without consent is never a default.
async function gratitudeStage(runId, run) {
  if (!run.brief?.tipCreators) {
    return { skipped: true, why: 'Creator tips not opted in: the report cites, it does not pay.', tips: [] };
  }
  if (!isSpendConfigured()) {
    return { skipped: true, why: 'No agent wallet on this deployment: nothing to tip with.', tips: [] };
  }
  const top = await db.researchSource.findMany({
    where: { runId },
    orderBy: [{ trust: 'desc' }, { relevance: 'desc' }],
    take: 3,
  });
  if (!top.length) {
    return { skipped: true, why: 'No scored sources to thank.', tips: [] };
  }
  const { budgetState: state } = await import('./money.js');
  const { balance } = await state(runId);
  const { runToolAgent } = await import('./agent/loop.js');
  const agent = await runToolAgent({
    task: `Tip the sources that were decisive for this research (up to $1 each). Candidates, most trusted first:\n${top.map((s, i) => `${i + 1}. ${s.title || s.url} — ${s.url} (trust ${s.trust ?? '?'})`).join('\n')}\nTip only pages that read as someone's creative work (articles, posts, videos, tools). Skip indexes, aggregators, and anything you cannot attribute. Do not tip when nothing qualifies — saying so is the correct output.`,
    tools: ['tip_creator'],
    maxSteps: 3,
    runId,
    policy: briefPolicy(run),
    balanceUsd: balance,
  });
  const tips = [];
  let costUsd = 0;
  for (const s of agent.steps) {
    if (!s.proposal?.tool || !s.result || s.result.skipped) continue;
    costUsd += s.result.costUsd || 0;
    tips.push({
      tool: s.proposal.tool, ok: s.result.ok, why: s.proposal.why,
      error: s.result.ok ? undefined : s.result.error,
      txHash: s.result.output?.txHash || s.result.output?.tx || undefined,
      judgement: s.judgement?.decision,
    });
  }
  return {
    why: tips.length
      ? 'The decisive sources got paid, not just cited — every tip proposed by the model and judged before signing.'
      : 'Nothing qualified for a tip: the report cites, it does not pay.',
    tips, costUsd, attempted: true, fallback: false,
  };
}

// ── Decisions (JEV's seat) ────────────────────────────────────────────────────// The language model proposes; JEV decides. These are the run's branch points,
// and each one is logged and streamed in full (question, options, probabilities,
// pick) by runChoice. When JEV is unreachable the run parks — the pipeline must
// never quietly let the model decide.

// Is interrupting the user worth it? Options are the real trade-off, including
// the honest "proceed and flag the assumption" one. Returns false when JEV
// parked the run, so the caller stops.
async function maybeAsk(runId, run) {
  const asked = await db.researchDecision.findFirst({ where: { runId, kind: 'question', step: 'midrun' } });
  if (asked) return true;
  const decision = await runChoice(runId, {
    step: 'midrun-ask',
    prompt: 'Is interrupting the user for a branch choice worth it?',
    state: `Topic: ${run.brief?.topic || 'the brief'}. The run has mapped the space and found a fork in the evidence: the top sources disagree on the core claim. Asking the user now costs one interruption; proceeding without asking risks researching the wrong branch for the remainder of the run.`,
    instructions: 'Choose whether the run should stop and ask the user to narrow the branch, or proceed now and flag the assumption in the report. Pick the option with the higher expected value.',
    options: [
      { id: 'ask', context: 'Stop and ask. The fork is material: the answer changes which branch is researched, and researching both doubles the remaining budget.' },
      { id: 'proceed', context: 'Proceed now. The fork is minor, or both branches are cheap to cover; record the choice as an assumption in the report instead of interrupting.' },
    ],
  });
  if (!decision) return false; // JEV unavailable; run parked.
  if (decision.pick === 'ask') {
    // The fork must name its branches: pull what round 0 actually found
    // (queries + top hit titles) and let the model phrase it as one pick.
    // A branchless "narrow me down" gets "i dont understand" answers.
    const search = await db.researchStep.findFirst({
      where: { runId, kind: 'search' },
      orderBy: { createdAt: 'desc' },
    });
    const out = search?.output || {};
    const titles = (out.results || []).filter((r) => r && r.title).map((r) => `${r.title}${r.provider ? ` [${r.provider}]` : ''}`);
    const branches = [
      `First direction in the hits: ${titles.slice(0, 3).join(' / ') || 'no usable hits'}`,
      `Second direction in the hits: ${titles.slice(3, 6).join(' / ') || 'no usable hits'}`,
      `Asked as: ${(out.queries || []).slice(0, 4).join(' / ')}`,
    ];
    const { generateForkQuestion } = await import('./llm/generate.js');
    const fork = await generateForkQuestion({ topic: run.brief?.topic, branches });
    if (fork) {
      await parkForQuestion(runId, {
        ...fork,
        why: 'The top sources disagree on the core claim, and going both ways doubles the remaining cost.',
      });
    } else {
      // No phrasing, no question: asking blind is worse than proceeding.
      // The assumption rides the report instead.
      await recordEvent(runId, {
        type: 'thinking', phase: 'midrun-fork',
        text: 'Search came back split but the fork could not be phrased as a clean choice, so the run proceeds on both branches and flags the split in the report.',
      });
    }
  }
  return true;
}

// ── Rounds ────────────────────────────────────────────────────────────────────
// A run advances one retrieval round at a time: search the round's questions,
// read the hits, score them, review what was learned, and let JEV decide
// whether another round is worth the spend. Each round checkpoints to the
// database and the event log before the next begins, so a crash, a pause, or a
// closed tab loses at most the round in flight — and a resume never pays for a
// finished round twice (see the `skipped` convention on stage()).
//
// Rounds are deliberately NOT separate queue jobs: the loop already gives one
// bounded LLM call and one JEV call per round with a durable checkpoint
// between them. Splitting rounds into jobs buys cross-process parallelism we
// do not need yet, at the cost of machinery we would have to debug. When runs
// need that parallelism, each round below maps 1:1 onto a job.

function roundAttempt(version, round) {
  return version * 1000 + round;
}

// How many rounds already have a finished score step: the next round to run.
// Derived from the ledger of finished work, never from memory, so any process
// that picks up the run agrees on where it is.
async function finishedRounds(runId, version) {
  const rows = await db.researchStep.findMany({
    where: { runId, kind: 'score', attempt: { gte: version * 1000 }, status: 'done' },
    select: { attempt: true },
  });
  let max = -1;
  for (const r of rows) max = Math.max(max, r.attempt - version * 1000);
  return max + 1;
}

async function latestReview(runId, round) {
  return db.researchDecision.findFirst({
    where: { runId, kind: 'round-review', step: `round-${round}` },
    orderBy: { seq: 'desc' },
  });
}

// Distill one round into learnings and follow-ups, and persist both as the
// round's record. The next round's questions come from here — from what this
// round found missing — which is what makes expansion guided rather than flat.
async function reviewRound(runId, run, round) {
  const sources = await db.researchSource.findMany({
    where: { runId },
    orderBy: [{ trust: 'desc' }, { relevance: 'desc' }],
    take: 20,
  });
  const out = await generateRoundReview({
    brief: run.brief || {},
    round,
    sources: sources.map((s) => ({ url: s.url, title: s.title, domain: s.domain })),
  });
  await db.researchDecision.create({
    data: {
      runId, kind: 'round-review', step: `round-${round}`,
      prompt: `What did round ${round} establish, and what should round ${round + 1} ask?`,
      question: { round },
      output: { learnings: out.learnings, followUps: out.followUps, source: out.source, model: out.model, llmError: out.llmError || null },
      confidence: null,
    },
  });
  await recordEvent(runId, {
    type: 'round.reviewed', round,
    learnings: out.learnings, followUps: out.followUps, source: out.source,
  });
  return out;
}

// Continue or write? JEV weighs the follow-ups against their cost, with the
// depth cap as a hard stop: at the cap the run writes with what it has, and
// the event says the cap — not the evidence — is why.
async function decideRoundContinue(runId, run, review, round, maxRounds) {
  if (round >= maxRounds || !review.followUps.length) {
    await recordEvent(runId, {
      type: 'round.capped', round,
      reason: round >= maxRounds ? `depth allows ${maxRounds} follow-up round(s); writing with what was collected` : 'no follow-up questions came out of review; writing with what was collected',
    });
    return 'write';
  }
  const decision = await runChoice(runId, {
    step: 'round-continue',
    prompt: `Round ${round + 1}: another retrieval round, or write?`,
    state: [
      `Topic: ${run.brief?.topic || 'the brief'}.`,
      `Round ${round} learnings: ${review.learnings.length ? review.learnings.join(' / ') : '(none recorded)'}.`,
      `Proposed follow-ups: ${review.followUps.join(' / ')}.`,
    ].join('\n'),
    instructions: 'Decide whether another retrieval round is worth its cost, or the run should write now. Continue only when a follow-up would change the report; otherwise write with what was collected.',
    options: [
      { id: 'continue', context: `Ask the follow-ups next round: ${review.followUps.slice(0, 3).join(' / ')}${review.followUps.length > 3 ? ' (and more)' : ''}. Worth another round of spend.` },
      { id: 'write', context: 'Write now. The follow-ups are marginal, already answered, or cheaper to flag as assumptions than to chase.' },
    ],
  });
  if (!decision) return null; // JEV parked the run
  return decision.pick === 'continue' ? 'continue' : 'write';
}

export async function runPlan(runId) {
  const run = await loadRun(runId);
  const guidance = await takeGuidance(runId);
  const brief = run.brief || {};
  // The language model proposes the plan; it decides nothing about stopping or
  // trust. When it is unavailable the deterministic fallback keeps the run
  // honest rather than failing it.
  const planned = await stage(runId, 'plan', run.versions, async () => {
    const generated = await generatePlan({ brief, guidance });
    await recordEvent(runId, {
      type: generated.source === 'llm' ? 'thinking' : 'thinking.fallback',
      phase: 'plan',
      text: generated.why || null,
    });
    return {
      sub_questions: generated.sub_questions,
      uncertainties: generated.uncertainties,
      estimate: generated.estimate,
      source: generated.source,
      model: generated.model,
      llmError: generated.llmError || null,
      llmCost: generated.usage?.costUsd ?? null,
    };
  });
  if (!planned?.skipped && !(await charge(runId, 'plan', planned?.llmCost))) return;
  const subQuestions = planned?.sub_questions || [];
  const estimate = estimatePlanCost({ subQuestions, depth: brief.depth, lengthWords: brief.lengthWords });
  await db.researchRun.update({
    where: { id: runId },
    data: { plan: { sub_questions: subQuestions, estimate }, status: 'planned' },
  });
  await recordEvent(runId, { type: 'plan.ready', estimate, sub_questions: subQuestions });
}

export async function runExecute(runId) {
  let run = await loadRun(runId);
  if (run.status === 'paused' || run.status === 'awaiting') return;
  const limits = depthLimits(run.brief?.depth);
  const maxRounds = limits.rounds;

  // Round 0 asks the plan's questions; every later round asks the previous
  // round's follow-ups. Stages return their real, metered cost where one was
  // incurred, and a stage that parked (JEV down) short-circuits before charge.
  const planQuestions = () => {
    const sub = Array.isArray(run.plan?.sub_questions) ? run.plan.sub_questions : [];
    return (sub.length ? sub : [run.brief?.topic || 'the brief']).slice(0, limits.queries);
  };

  let round = await finishedRounds(runId, run.versions);
  for (;;) {
    const attempt = roundAttempt(run.versions, round);
    const queries = round === 0
      ? planQuestions()
      : ((await latestReview(runId, round - 1))?.output?.followUps || []);
    if (round > 0 && !queries.length) break; // nothing new to ask: write

    const searched = await stage(runId, 'search', attempt, () => searchStage(runId, run, queries));
    if (!searched?.skipped && !(await charge(runId, 'search', searched?.costUsd))) return;
    if (await halt(runId)) return;

    if (round === 0) {
      if (!(await maybeAsk(runId, run))) return; // JEV parked the run
      if (await halt(runId)) return;
    }

    const fetched = await stage(runId, 'fetch', attempt, () => fetchStage(runId, run));
    if (!fetched?.skipped && !(await charge(runId, 'fetch', fetched?.costUsd))) return;
    if (await halt(runId)) return;

    const direct = await stage(runId, 'data', attempt, () => dataStage(runId, run, queries));
    if (!direct?.skipped && !(await charge(runId, 'data', direct?.costUsd))) return;
    if (await halt(runId)) return;

    const scored = await stage(runId, 'score', attempt, () => scoreStage(runId, run));
    if (scored?.parked) return; // JEV parked the run; nothing to charge
    if (!scored?.skipped && !(await charge(runId, 'score', scored?.costUsd))) return;
    if (await halt(runId)) return;

    const review = await reviewRound(runId, run, round);
    let verdict;
    try {
      verdict = await decideRoundContinue(runId, run, review, round, maxRounds);
    } catch (error) {
      // A stage failure parks visibly via stage(); the round decision sits
      // outside any stage, so without this a throw here kills the driver and
      // the run sits `running` forever with no error anywhere. Fail loudly.
      await recordEvent(runId, { type: 'failed', kind: 'review', error: String(error?.message || error).slice(0, 300) });
      await park(runId, 'failed', 'error');
      return;
    }
    if (!verdict) return; // JEV parked the run
    if (verdict === 'write') break;
    run = await loadRun(runId);
    round += 1;
  }

  run = await loadRun(runId);
  const guidance = await takeGuidance(runId);
  const tipped = await stage(runId, 'tips', run.versions, () => gratitudeStage(runId, run));
  if (!tipped?.skipped && !(await charge(runId, 'tips', tipped?.costUsd))) return;
  const written = await stage(runId, 'write', run.versions, () => writeStage(runId, run, guidance));
  if (!written?.skipped && !(await charge(runId, 'write', written?.llmCost))) return;

  await park(runId, 'complete');
  await settle(runId, 'complete');
  // Escrowed runs release the remainder onchain here (submit + complete +
  // split attestation); never throws, so the run stays complete regardless.
  try {
    const { settleEscrowRun } = await import('./escrow/settle.js');
    await settleEscrowRun(runId, 'complete');
  } catch {}
  // The run is over: its sandbox has no more work and must not keep billing.
  await destroySandbox(runId);
}

export async function runInline(name, data) {
  if (name === 'run.plan') return runPlan(data.runId);
  if (name === 'run.execute') return runExecute(data.runId);
  throw new Error(`unknown job ${name}`);
}

export const workerHandlers = {
  'run.plan': (d) => runPlan(d.runId),
  'run.execute': (d) => runExecute(d.runId),
};

export async function requestPlan(runId) { return enqueue('run.plan', { runId }); }
export async function requestExecute(runId) { return enqueue('run.execute', { runId }); }

export { budgetState };

// ── Worker entrypoint (`pnpm worker`) ─────────────────────────────────────────
// Boots the durable queue, reclaims anything a dead worker left mid-stage, then
// consumes jobs. SIGTERM drains: in-flight stages finish and checkpoint (their
// lease keeps them safe while they do), then the process exits. Anything still
// `active` afterwards is picked up by the next boot's sweep — a kill can delay
// a run, never silently stall it.
const isMainEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainEntry) {
  const { initQueue, startWorkers, queueMode, closeQueue } = await import('./queue.js');
  await initQueue();
  const swept = await requeueOrphans();
  const stalled = await requeueStalledRuns();
  const workers = startWorkers(workerHandlers);
  console.log(`[dr-nib] worker up (${queueMode()}), reclaimed ${swept.reclaimed} orphaned step(s) across ${swept.runs.length} run(s), requeued ${stalled.kicked.length} stalled run(s)`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[dr-nib] ${signal}: draining ${inFlightSteps()} in-flight stage(s)…`);
    const deadline = Date.now() + Number(process.env.DRNIB_SHUTDOWN_GRACE_MS || 60_000);
    while (inFlightSteps() > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }
    await destroyAllSandboxes().catch(() => {});
    await closeQueue(workers).catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}