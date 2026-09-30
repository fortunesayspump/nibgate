import { db } from './db.js';
import { publish } from './events.js';
import { enqueue } from './queue.js';

const STAGE_COSTS = { plan: 0.02, search: 0.03, fetch: 0.06, score: 0.02, write: 0.09 };

async function spend(runId, amount, kind = 'spend') {
  await db.budgetLedger.create({ data: { runId, kind, amount } });
}

async function step(runId, kind, fn) {
  const row = await db.researchStep.create({ data: { runId, kind, status: 'active', startedAt: new Date() } });
  publish(runId, { type: 'step.started', kind });
  try {
    const out = await fn();
    await db.researchStep.update({ where: { id: row.id }, data: { status: 'done', output: out ?? {}, endedAt: new Date() } });
    publish(runId, { type: 'step.finished', kind });
    return out;
  } catch (error) {
    await db.researchStep.update({ where: { id: row.id }, data: { status: 'failed', output: { error: error.message }, endedAt: new Date() } });
    publish(runId, { type: 'failed', kind, error: error.message });
    throw error;
  }
}

async function setStatus(runId, status, extra = {}) {
  const run = await db.researchRun.update({ where: { id: runId }, data: { status, ...extra } });
  publish(runId, { type: status === 'complete' ? 'complete' : 'status', status });
  return run;
}

// Pipeline stages. Retrieval/LLM/JEV calls land here behind metered
// interfaces; current bodies are deterministic stubs so the API, SSE,
// budget, and UI contracts are exercisable end to end.
export async function runPlan(runId) {
  const run = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
  await step(runId, 'plan', async () => {
    const brief = run.brief || {};
    return {
      sub_questions: [
        `What does the evidence say about: ${brief.topic || 'the brief'} (angle 1)`,
        `What does the evidence say about: ${brief.topic || 'the brief'} (angle 2)`,
      ],
      estimate: 0.2,
    };
  });
  await spend(runId, STAGE_COSTS.plan);
  await db.researchRun.update({ where: { id: runId }, data: { plan: { estimate: 0.2 }, status: 'planned' } });
  publish(runId, { type: 'plan.ready', estimate: 0.2 });
}

export async function runExecute(runId) {
  const run = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status === 'paused') return;
  await step(runId, 'search', async () => ({ queries: 6, hits: 12 }));
  await spend(runId, STAGE_COSTS.search);
  if ((await halted(runId))) return;
  await step(runId, 'fetch', async () => ({ pages: 5 }));
  await spend(runId, STAGE_COSTS.fetch);
  if ((await halted(runId))) return;
  await step(runId, 'score', async () => {
    await db.researchSource.createMany({
      data: [
        { runId, url: 'https://example.com/a', title: 'Example source A', domain: 'example.com', relevance: 0.9, trust: 0.8 },
        { runId, url: 'https://example.com/b', title: 'Example source B', domain: 'example.com', relevance: 0.7, trust: 0.5 },
      ],
      skipDuplicates: true,
    });
    return { scored: 2 };
  });
  await spend(runId, STAGE_COSTS.score);
  if ((await halted(runId))) return;
  await step(runId, 'write', async () => {
    const markdown = `## Headline\n\nDraft for run ${runId}. Replace with synthesized evidence.\n`;
    await db.researchReport.create({ data: { runId, version: run.versions, markdown, citations: [] } });
    return { version: run.versions };
  });
  await spend(runId, STAGE_COSTS.write);
  await setStatus(runId, 'complete');
}

async function halted(runId) {
  const run = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status === 'paused') { publish(runId, { type: 'paused' }); return true; }
  return false;
}

export async function runInline(name, data) {
  if (name === 'run.plan') return runPlan(data.runId);
  if (name === 'run.execute') return runExecute(data.runId);
  throw new Error(`unknown job ${name}`);
}

export const workerHandlers = { 'run.plan': (d) => runPlan(d.runId), 'run.execute': (d) => runExecute(d.runId) };

export async function requestPlan(runId) { return enqueue('run.plan', { runId }); }
export async function requestExecute(runId) { return enqueue('run.execute', { runId }); }
