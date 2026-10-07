import { Router } from 'express';
import { db } from '../db.js';
import * as auth from '../auth.js';
import { budgetState } from '../money.js';
import { PLANNED, RENDERABLE, renderExport } from '../exports/render.js';
import { isR2Configured, putExport } from '../exports/storage.js';
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
  const run = await ownedRun(req, res);
  if (!run) return;
  const report = await db.researchReport.findFirst({ where: { runId: run.id }, orderBy: { version: 'desc' } });
  if (!report) return res.status(409).json({ error: 'no finished report to export yet' });
  const [sources, claims] = await Promise.all([
    db.researchSource.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } }),
    db.researchClaim.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } }),
  ]);
  const rendered = await renderExport(format, {
    report, sources, claims,
    ledger: await budgetState(run.id),
    slug: `drnib-${run.id.slice(0, 8)}-v${report.version}`,
  });
  // Prefer the hub R2 bucket for binary deliverables: upload, store the key,
  // and return a URL instead of inlining base64. Fall back to base64 when R2
  // (or the SDK) is unavailable, so an export never fails for lack of storage.
  let stored = null;
  if (rendered.encoding === 'base64' && isR2Configured()) {
    try {
      stored = await putExport({
        key: `drnib/${run.id}/${rendered.filename}`,
        body: Buffer.from(rendered.content, 'base64'),
        contentType: rendered.contentType,
      });
    } catch {
      stored = null;
    }
  }
  const row = await db.researchExport.create({
    data: { runId: run.id, reportVersion: report.version, format, status: 'done', r2Key: stored?.storageRef || null },
  });
  if (stored) {
    const { contentType, filename, bytes } = rendered;
    return res.json({ ...row, contentType, filename, bytes, url: stored.url, storageRef: stored.storageRef });
  }
  res.json({ ...row, ...rendered });
});

exports.get('/runs/:id/exports/:exportId', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  const row = await db.researchExport.findFirst({ where: { id: req.params.exportId, runId: run.id } });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});