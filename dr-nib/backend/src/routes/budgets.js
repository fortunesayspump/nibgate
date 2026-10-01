import { Router } from 'express';
import { db } from '../db.js';
import * as auth from '../auth.js';
import { budgetState, raiseCap } from '../money.js';
import { jsonSafe, toNum } from '../units.js';

export const budgets = Router();

budgets.use((req, res, next) => auth.middleware(req, res, next));

// Budget is a view of the run's ledger, so it comes from the same place as the
// money: never recomputed per client, never trusted from the request body.
budgets.get('/:runId', async (req, res) => {
  try {
    const run = await db.researchRun.findUnique({ where: { id: req.params.runId } });
    if (!run || !auth.isOwner(req.user, run)) return res.status(404).json({ error: 'project not found' });
    const entries = await db.budgetLedger.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } });
    res.json(jsonSafe({ runId: run.id, budgetCap: toNum(run.budgetCap), ...(await budgetState(run.id)), entries }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Top-up == raising the cap. Once a run has started this is raise-only.
budgets.post('/:runId/topup', async (req, res) => {
  try {
    const { amount, txRef } = req.body || {};
    const run = await db.researchRun.findUnique({ where: { id: req.params.runId } });
    if (!run || !auth.isOwner(req.user, run)) return res.status(404).json({ error: 'project not found' });
    const result = await raiseCap(run.id, Number(amount), txRef || null);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.status(201).json({ runId: run.id, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});