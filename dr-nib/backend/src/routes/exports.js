import { Router } from 'express';
import { db } from '../db.js';
import * as auth from '../auth.js';
import { budgetState } from '../money.js';
import { PLANNED, RENDERABLE, renderExport } from '../exports/render.js';
import { idempotency } from '../idempotency.js';

const FORMATS = new Set([...RENDERABLE, ...PLANNED]);

export const exports = Router();

exports.use((req, res, next) => auth.middleware(req, res, next));
exports.use((req, res, next) => idempotency(req, res, next));

async function ownedRun(req, res) {
  const run = await db.researchRun.findUnique({ where: { id: req.params.id } });
  if (!run || !auth.isOwner(req.user, run)) {
    res.status(404).json({ error: 'project not found' });
    return null;
  }
  return run;
}

exports.post('/runs/:id/exports', async (req, res) => {
  const { format } = req.body || {};
  if (!FORMATS.has(format)) return res.status(400).json({ error: `format must be one of ${[...FORMATS].join(', ')}` });
  // Binary renderers need libraries and object storage that are not wired yet.
  // Say so plainly instead of queueing work nothing will ever pick up.
  if (!RENDERABLE.has(format)) {
    return res.status(501).json({ error: `${format} export is not implemented yet (needs a renderer and R2 object storage)` });
  }
  const run = await ownedRun(req, res);
  if (!run) return;
  const report = await db.researchReport.findFirst({ where: { runId: run.id }, orderBy: { version: 'desc' } });
  if (!report) return res.status(409).json({ error: 'no finished report to export yet' });
  const [sources, claims] = await Promise.all([
    db.researchSource.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } }),
    db.researchClaim.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } }),
  ]);
  const rendered = renderExport(format, {
    report, sources, claims,
    ledger: await budgetState(run.id),
    slug: `drnib-${run.id.slice(0, 8)}-v${report.version}`,
  });
  const row = await db.researchExport.create({
    data: { runId: run.id, reportVersion: report.version, format, status: 'done' },
  });
  res.json({ ...row, ...rendered });
});

exports.get('/runs/:id/exports/:exportId', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  const row = await db.researchExport.findFirst({ where: { id: req.params.exportId, runId: run.id } });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});