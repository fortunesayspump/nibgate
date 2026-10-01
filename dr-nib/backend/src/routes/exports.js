import { Router } from 'express';
import { db } from '../db.js';
import * as auth from '../auth.js';

const FORMATS = new Set(['pdf', 'word', 'excel', 'powerpoint', 'md', 'json', 'bibtex']);

export const exports = Router();

exports.use((req, res, next) => auth.middleware(req, res, next));

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
  const row = await db.researchExport.create({
    data: { runId: run.id, reportVersion: run.versions, format, status: 'queued' },
  });
  res.status(202).json(row);
});

exports.get('/runs/:id/exports/:exportId', async (req, res) => {
  const run = await ownedRun(req, res);
  if (!run) return;
  const row = await db.researchExport.findFirst({ where: { id: req.params.exportId, runId: run.id } });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});