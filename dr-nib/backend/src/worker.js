// FIRST import: env.js must populate process.env before db.js builds a client.
import './env.js';

import { db } from './db.js';
import { publish } from './events.js';
import { enqueue } from './queue.js';
import { budgetState, draw, settle } from './money.js';

const STAGE_COSTS = { plan: 0.02, search: 0.03, fetch: 0.06, score: 0.02, write: 0.09 };

// A parked run must not keep spending. `awaiting` counts as parked: the run
// stopped to ask the user something, and money does not move while it waits.
const PARKED = new Set(['paused', 'awaiting', 'ended', 'failed', 'complete']);

const loadRun = (runId) => db.researchRun.findUniqueOrThrow({ where: { id: runId } });

async function park(runId, status, reason = null) {
  const run = await db.researchRun.update({ where: { id: runId }, data: { status, pauseReason: reason } });
  publish(runId, { type: status === 'complete' ? 'complete' : 'status', status, pauseReason: reason });
  return run;
}

export async function halt(runId) {
  const run = await loadRun(runId);
  if (!PARKED.has(run.status)) return false;
  if (run.status === 'paused' && run.pauseReason !== 'user') {
    publish(runId, { type: 'status', status: run.status, pauseReason: run.pauseReason });
  }
  return true;
}

// Guidance typed while a stage is running is held here and picked up at the
// next stage boundary, so a stage never reads half-written input.
async function takeGuidance(runId) {
  const run = await loadRun(runId);
  if (!run.pendingGuidance) return null;
  await db.researchRun.update({ where: { id: runId }, data: { pendingGuidance: null } });
  publish(runId, { type: 'guidance.applied', guidance: run.pendingGuidance });
  return run.pendingGuidance;
}

export async function parkForQuestion(runId, question) {
  await db.researchRun.update({
    where: { id: runId },
    data: { status: 'awaiting', pendingQuestion: question, pauseReason: 'awaiting' },
  });
  publish(runId, { type: 'awaiting', question });
  return question;
}

// Stages are keyed by (kind, attempt) where attempt is the run's version, so a
// resume continues from the last finished stage while a revision starts clean.
async function stage(runId, kind, version, fn) {
  const done = await db.researchStep.findFirst({
    where: { runId, kind, attempt: version, status: 'done' },
    orderBy: { createdAt: 'desc' },
  });
  if (done) {
    publish(runId, { type: 'step.skipped', kind, reason: 'already done' });
    return done.output ?? {};
  }
  const row = await db.researchStep.create({
    data: { runId, kind, status: 'active', attempt: version, startedAt: new Date() },
  });
  publish(runId, { type: 'step.started', kind });
  try {
    const out = await fn();
    await db.researchStep.update({
      where: { id: row.id },
      data: { status: 'done', output: out ?? {}, endedAt: new Date() },
    });
    publish(runId, { type: 'step.finished', kind });
    return out;
  } catch (error) {
    await db.researchStep.update({
      where: { id: row.id },
      data: { status: 'failed', output: { error: error.message }, endedAt: new Date() },
    });
    publish(runId, { type: 'failed', kind, error: error.message });
    await park(runId, 'failed', 'error');
    throw error;
  }
}

// Charge the stage, or park at the cap rather than overspending. The balance
// stays intact and the owner decides: raise the cap or end.
async function charge(runId, kind) {
  const result = await draw(runId, STAGE_COSTS[kind]);
  const run = await loadRun(runId);
  publish(runId, {
    type: 'budget.tick',
    kind,
    used: result.used,
    balance: result.balance,
    cap: run.budgetCap,
  });
  if (!result.ok) await park(runId, 'paused', 'cap');
  return result.ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Pipeline ──────────────────────────────────────────────────────────────────
// Retrieval/LLM/JEV calls land here behind metered interfaces; current bodies
// are deterministic stubs so the API, SSE, budget, and lifecycle contracts are
// exercisable end to end.

async function searchStage(run) {
  await sleep(1200);
  const topic = run.brief?.topic || 'the brief';
  return {
    why: 'Casting a wide net first: queries across news, docs, and forums to map the space before reading anything.',
    queries: [
      `${topic} — overview`,
      `${topic} — latest developments`,
      `${topic} — data and figures`,
      `${topic} — criticism and limits`,
    ],
    hits: 12,
  };
}

async function fetchStage(run) {
  await sleep(1500);
  return {
    why: 'Opening the top hits and extracting claim-bearing passages; skipping paywalled and duplicate pages.',
    urls: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
    pages: 5,
  };
}

async function scoreStage(runId) {
  await sleep(900);
  await db.researchSource.createMany({
    data: [
      { runId, url: 'https://example.com/a', title: 'Example source A', domain: 'example.com', relevance: 0.9, trust: 0.8 },
      { runId, url: 'https://example.com/b', title: 'Example source B', domain: 'example.com', relevance: 0.7, trust: 0.5 },
    ],
    skipDuplicates: true,
  });
  return {
    why: 'Relevance and trust scored separately — a source can be on-topic yet untrustworthy, and that must never count as evidence.',
    scored: 2,
  };
}

async function writeStage(runId, run) {
  await sleep(1200);
  const markdown = `## Headline\n\nDraft for run ${runId}. Replace with synthesized evidence.\n`;
  await db.researchReport.create({ data: { runId, version: run.versions, markdown, citations: [] } });
  return { why: 'Synthesizing only from scored passages; every claim carries a citation or is marked Unknown.', version: run.versions };
}

// The seam where JEV's "is this worth interrupting the user for?" decision will
// land. Today it parks once per run so the awaiting lifecycle is real.
async function maybeAsk(runId) {
  const asked = await db.researchDecision.findFirst({ where: { runId, kind: 'question', step: 'midrun' } });
  if (asked) return;
  await parkForQuestion(runId, {
    id: 'scope-check',
    type: 'free',
    prompt: 'I have mapped the space and found a fork in the evidence. Narrow me to one branch, or say "either".',
    why: 'The top sources disagree on the core claim, and going both ways doubles the remaining cost.',
  });
}

export async function runPlan(runId) {
  const run = await loadRun(runId);
  const guidance = await takeGuidance(runId);
  const brief = run.brief || {};
  await stage(runId, 'plan', run.versions, async () => ({
    sub_questions: [
      `What does the evidence say about: ${brief.topic || 'the brief'} (angle 1)`,
      `What does the evidence say about: ${brief.topic || 'the brief'} (angle 2)`,
    ],
    guidance: guidance || null,
    estimate: 0.2,
  }));
  if (!(await charge(runId, 'plan'))) return;
  await db.researchRun.update({
    where: { id: runId },
    data: { plan: { estimate: 0.2 }, status: 'planned' },
  });
  publish(runId, { type: 'plan.ready', estimate: 0.2 });
}

export async function runExecute(runId) {
  let run = await loadRun(runId);
  if (run.status === 'paused' || run.status === 'awaiting') return;

  await stage(runId, 'search', run.versions, () => searchStage(run));
  if (!(await charge(runId, 'search'))) return;
  if (await halt(runId)) return;

  await maybeAsk(runId);
  if (await halt(runId)) return;

  await stage(runId, 'fetch', run.versions, () => fetchStage(run));
  if (!(await charge(runId, 'fetch'))) return;
  if (await halt(runId)) return;

  await stage(runId, 'score', run.versions, () => scoreStage(runId));
  if (!(await charge(runId, 'score'))) return;
  if (await halt(runId)) return;

  run = await loadRun(runId);
  const guidance = await takeGuidance(runId);
  await stage(runId, 'write', run.versions, () => writeStage(runId, { ...run, brief: { ...(run.brief || {}), guidance } }));
  if (!(await charge(runId, 'write'))) return;

  await park(runId, 'complete');
  await settle(runId, 'complete');
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