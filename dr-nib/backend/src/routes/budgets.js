import { Router } from 'express';
import { db } from '../db.js';

export const budgets = Router();

budgets.get('/:runId', async (req, res) => {
  const entries = await db.budgetLedger.findMany({ where: { runId: req.params.runId }, orderBy: { createdAt: 'asc' } });
  const deposited = entries.filter((e) => e.kind === 'deposit').reduce((s, e) => s + e.amount, 0);
  const spent = entries.filter((e) => e.kind === 'spend').reduce((s, e) => s + e.amount, 0);
  res.json({ runId: req.params.runId, deposited, spent, balance: deposited - spent, entries });
});

budgets.post('/:runId/topup', async (req, res) => {
  const { amount, txRef } = req.body || {};
  if (!(Number(amount) > 0)) return res.status(400).json({ error: 'amount must be > 0' });
  const entry = await db.budgetLedger.create({ data: { runId: req.params.runId, kind: 'deposit', amount: Number(amount), txRef: txRef || null } });
  res.status(201).json(entry);
});
