import { SOURCE_ORDER, reportSources } from '../report-evidence.js';
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

exports.post('/runs/:id/exports', async (req, res, next) => {
  try {
  const { format } = req.body || {};
  if (!FORMATS.has(format)) return res.status(400).json({ error: `format must be one of ${[...FORMATS].join(', ')}` });
  const run = await ownedRun(req, res);
  if (!run) return;
  const report = await db.researchReport.findFirst({ where: { runId: run.id }, orderBy: { version: 'desc' } });
  if (!report) return res.status(409).json({ error: 'no finished report to export yet' });
  const [sources, claims] = await Promise.all([
    db.researchSource.findMany({ where: { runId: run.id }, orderBy: SOURCE_ORDER }),
    db.researchClaim.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } }),
  ]);
  const rendered = await renderExport(format, {
    report, sources: reportSources(report, sources), claims,
    ledger: await budgetState(run.id),
    escrow: (run.metadata && run.metadata.escrow) || null,
    slug: `drnib-${run.id.slice(0, 8)}-v${report.version}`,
  });
  // All research can contain private briefs, even without an uploaded file.
  // Return authenticated bytes; never publish a report to the public media CDN.
  const row = await db.researchExport.create({
    data: { runId: run.id, reportVersion: report.version, format, status: 'done', r2Key: null },
  });
  res.json({ ...row, ...rendered });
  } catch (error) { next(error); }
});

exports.get('/runs/:id/exports/:exportId', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  const row = await db.researchExport.findFirst({ where: { id: req.params.exportId, runId: run.id } });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});
