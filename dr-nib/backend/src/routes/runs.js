import { Router } from 'express';
import { db } from '../db.js';
import { subscribe } from '../events.js';
import { requestExecute, requestPlan } from '../worker.js';

export const runs = Router();

runs.post('/', async (req, res) => {
  try {
    const { topic, depth = 'standard', budgetCap, provider = 'hub', formats = ['pdf'], liveWeb = true } = req.body || {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) return res.status(400).json({ error: 'topic is required' });
    if (!(Number(budgetCap) > 0)) return res.status(400).json({ error: 'budgetCap must be > 0' });
    const run = await db.researchRun.create({
      data: { brief: { topic, depth, provider, formats, liveWeb }, depth, budgetCap: Number(budgetCap), provider, status: 'draft' },
    });
    await db.budgetLedger.create({ data: { runId: run.id, kind: 'deposit', amount: Number(budgetCap) } });
    await requestPlan(run.id);
    res.status(202).json({ id: run.id, status: run.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

runs.get('/', async (req, res) => {
  const rows = await db.researchRun.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 });
  res.json({ runs: rows });
});

runs.get('/:id', async (req, res) => {
  const run = await db.researchRun.findUnique({
    where: { id: req.params.id },
    include: { steps: true, sources: true, claims: true, reports: { orderBy: { version: 'desc' }, take: 1 }, ledger: true },
  });
  if (!run) return res.status(404).json({ error: 'not found' });
  const spent = run.ledger.filter((l) => l.kind === 'spend').reduce((s, l) => s + l.amount, 0);
  res.json({ ...run, spent });
});

runs.post('/:id/approve', async (req, res) => {
  const run = await db.researchRun.findUniqueOrThrow({ where: { id: req.params.id } });
  if (run.status !== 'planned') return res.status(409).json({ error: `cannot approve from ${run.status}` });
  await db.researchRun.update({ where: { id: run.id }, data: { status: 'running' } });
  await requestExecute(run.id);
  res.json({ id: run.id, status: 'running' });
});

for (const action of ['pause', 'resume']) {
  runs.post(`/:id/${action}`, async (req, res) => {
    const status = action === 'pause' ? 'paused' : 'running';
    await db.researchRun.update({ where: { id: req.params.id }, data: { status } });
    if (action === 'resume') await requestExecute(req.params.id);
    res.json({ id: req.params.id, status });
  });
}

runs.get('/:id/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
  subscribe(req.params.id, res);
});

runs.post('/:id/revise', async (req, res) => {
  const run = await db.researchRun.findUniqueOrThrow({ where: { id: req.params.id } });
  const version = run.versions + 1;
  await db.researchRun.update({ where: { id: run.id }, data: { versions: version, status: 'running' } });
  await requestExecute(run.id);
  res.status(202).json({ id: run.id, version, status: 'running' });
});

runs.get('/:id/report', async (req, res) => {
  const report = await db.researchReport.findFirst({ where: { runId: req.params.id }, orderBy: { version: 'desc' } });
  if (!report) return res.status(404).json({ error: 'no report yet' });
  res.json(report);
});
