import { Prisma } from '@prisma/client';
import { db } from './db.js';
import { publish } from './events.js';
import { sumDb, toDb, toNum } from './units.js';

// The 1% platform fee, taken as the budget draws down rather than up front —
// the user pays for what actually got spent, and an abandoned run refunds.
export const FEE_BPS = 100;
const ZERO = new Prisma.Decimal(0);

// The ledger is append-only and the only source of truth for a balance.
export async function budgetState(runId) {
  const entries = await db.budgetLedger.findMany({ where: { runId } });
  const total = (kind) => sumDb(entries.filter((e) => e.kind === kind).map((e) => e.amount));
  const deposited = total('deposit');
  const spend = total('spend');
  const fee = total('fee');
  const refund = total('refund');
  const used = spend.plus(fee);
  return {
    deposited: toNum(deposited),
    spend: toNum(spend),
    fee: toNum(fee),
    refund: toNum(refund),
    used: toNum(used),
    balance: toNum(deposited.minus(used).minus(refund)),
  };
}

// Draw the budget down for one stage. Refuses rather than overspending: a run
// that reaches its cap pauses with its balance intact, and the owner decides
// whether to raise the cap or call it done.
export async function draw(runId, amount, kind = 'spend') {
  const run = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
  const amountDb = toDb(amount);
  const feeDb = amountDb.mul(FEE_BPS).div(10000);
  const state = await budgetState(runId);

  if (toDb(state.used).plus(amountDb).plus(feeDb).gt(toDb(run.budgetCap))) {
    return { ok: false, reason: 'cap', fee: 0, ...state };
  }

  await db.$transaction([
    db.budgetLedger.create({ data: { runId, kind, amount: amountDb } }),
    db.budgetLedger.create({ data: { runId, kind: 'fee', amount: feeDb } }),
  ]);
  return { ok: true, fee: toNum(feeDb), ...(await budgetState(runId)) };
}

// Hold more against the cap. Raise-only once a run is configured: a cap that
// could go down mid-run is a cap the user was never really shown.
export async function raiseCap(runId, amount, txRef = null) {
  const run = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
  if (!(toNum(amount) > 0)) return { ok: false, error: 'amount must be > 0' };
  if (run.status !== 'intake-done' && run.status !== 'intake' && toDb(amount).lt(run.budgetCap)) {
    return { ok: false, error: 'a budget can only be raised' };
  }
  await db.$transaction([
    db.researchRun.update({ where: { id: runId }, data: { budgetCap: toDb(amount) } }),
    db.budgetLedger.create({ data: { runId, kind: 'deposit', amount: toDb(amount), txRef } }),
  ]);
  return { ok: true, budgetCap: toNum(amount), ...(await budgetState(runId)) };
}

// Settle: hand back whatever is left, immediately, once the run can no longer
// spend it. Called on completion and on an explicit end.
export async function settle(runId, reason) {
  const state = await budgetState(runId);
  const remainder = toDb(state.balance);
  const rows = [];
  if (remainder.gt(ZERO)) {
    rows.push(db.budgetLedger.create({ data: { runId, kind: 'refund', amount: remainder } }));
  }
  rows.push(db.researchRun.update({ where: { id: runId }, data: { settledAt: new Date() } }));
  await db.$transaction(rows);
  const after = await budgetState(runId);
  publish(runId, { type: 'settled', reason, refunded: toNum(remainder), ...after });
  return { refunded: toNum(remainder), ...after };
}