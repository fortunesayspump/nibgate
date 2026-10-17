import { Prisma } from '@prisma/client';
import { db } from './db.js';
import { withRunLock } from './run-lock.js';
import { publish } from './events.js';
import { sumDb, toDb, toNum } from './units.js';
import { isEscrowConfigured } from './escrow/jobs.js';
import { assertConventionalPath, assertConfidentialDrawable } from './privacy/guard.js';

// The 1% platform fee, taken as the budget draws down rather than up front —
// the user pays for what actually got spent, and an abandoned run refunds.
export const FEE_BPS = 100;
const ZERO = new Prisma.Decimal(0);

// The 1% platform fee accrues on every draw, but it is operator-side: the
// escrow contract takes it from the operator's earned share at split time
// (earned = spent − fee), so the client's refund is budget − spent, never
// budget − spent − fee. Fee rows are the treasury's receivable memo —
// reported, never subtracted from the client's balance — which keeps the
// ledger exactly equal to what the chain moves at split.
export async function budgetState(runId, client = db) {
  const entries = await client.budgetLedger.findMany({ where: { runId } });
  const total = (kind) => sumDb(entries.filter((e) => e.kind === kind).map((e) => e.amount));
  const deposited = total('deposit');
  const spend = total('spend');
  const fee = total('fee');
  const refunded = total('refund');
  const used = spend;
  return {
    deposited: toNum(deposited),
    spend: toNum(spend),
    fee: toNum(fee),
    refunded: toNum(refunded),
    used: toNum(used),
    balance: toNum(deposited.minus(used).minus(refunded)),
  };
}

// Draw the budget down for one stage. Refuses rather than overspending: a run
// that reaches its cap pauses with its balance intact, and the owner decides
// whether to raise the cap or call it done.
//
// `allowConfidential` is the broker-metered path: it admits confidential runs
// (which assertConventionalPath otherwise blocks) but *only* confidential runs.
// It is reachable only from the broker-authenticated internal route — never
// from a user request.
export async function draw(runId, amount, kind = 'spend', txRef = null, {allowConfidential = false} = {}) {
  return withRunLock(runId, async tx => {
    const run = await tx.researchRun.findUniqueOrThrow({ where: { id: runId } });
    if (allowConfidential) assertConfidentialDrawable(run);
    else assertConventionalPath(run);
    const state = await budgetState(runId, tx);
    if(txRef && await tx.budgetLedger.findFirst({where:{runId,kind,txRef}})) return {ok:true,alreadyCharged:true,fee:0,...state};
    const amountDb = toDb(amount);
    if (amountDb.lt(ZERO)) throw new Error('spend must not be negative');
    if (amountDb.eq(ZERO)) return {ok:true, fee:0, ...state};
    if (run.settledAt || amountDb.gt(toDb(state.balance)) || toDb(state.used).plus(amountDb).gt(toDb(run.budgetCap))) {
      return {ok:false, reason:run.settledAt ? 'settled' : 'cap', fee:0, ...state};
    }
    const feeDb = amountDb.mul(FEE_BPS).div(10000);
    await tx.budgetLedger.create({ data:{runId,kind,amount:amountDb,txRef} });
    await tx.budgetLedger.create({ data:{runId,kind:'fee',amount:feeDb} });
    return {ok:true,fee:toNum(feeDb),...(await budgetState(runId,tx))};
  });
}

// Remaining cap headroom. This is an estimate gate before funding, never
// proof of available funds: execution must also check the live ledger balance
// and refuse settled runs. Refunded money cannot fund another pass.
export function spendable(budgetCap, used) {
  return toNum(toDb(budgetCap ?? 0).minus(toDb(used ?? 0)));
}

// Hold more against the cap. Raise-only, always: the ledger records the
// *difference* between the new cap and the old one, so deposited always equals
// the cap and a raise can never double-count money already held. A cap that
// could move down mid-run is a cap the user was never really shown.
export async function raiseCap(runId, amount, txRef = null) {
  return withRunLock(runId, async tx => {
  const run = await tx.researchRun.findUniqueOrThrow({ where: { id: runId } });
  assertConventionalPath(run);
  if(run.settledAt || ['complete','ended','failed'].includes(run.status)) return {ok:false,error:'This budget is closed. Start a new funded run.'};
  if(isEscrowConfigured() || run.metadata?.escrow?.jobId) return {ok:false,error:'Escrow deposits are one-shot. Start a fresh funded run for a larger budget.'};
  if (!(toNum(amount) > 0)) return { ok: false, error: 'amount must be > 0' };
  const capDb = toDb(run.budgetCap);
  const deltaDb = toDb(amount).minus(capDb);
  if (deltaDb.lte(ZERO)) return { ok: false, error: 'a budget can only be raised' };
  await tx.researchRun.update({ where: { id: runId }, data: { budgetCap: toDb(amount) } });
  await tx.budgetLedger.create({ data: { runId, kind: 'deposit', amount: deltaDb, txRef } });
  return { ok: true, budgetCap: toNum(amount), ...(await budgetState(runId,tx)) };
  });
}

// Settle: hand back whatever is left, immediately, once the run can no longer
// spend it. Called on completion and on an explicit end.
export async function settle(runId, reason, {allowConfidential = false} = {}) {
  const result = await withRunLock(runId, async tx => {
    const run = await tx.researchRun.findUniqueOrThrow({where:{id:runId}});
    if (allowConfidential) assertConfidentialDrawable(run);
    else assertConventionalPath(run);
    const state = await budgetState(runId,tx);
    if (await tx.researchStep.count({where:{runId,status:'active'}})) return {pending:true,refunded:0,...state};
    const remainder = toDb(state.balance);
    if (!run.settledAt && remainder.gt(ZERO)) await tx.budgetLedger.create({data:{runId,kind:'refund',amount:remainder}});
    if (!run.settledAt) await tx.researchRun.update({where:{id:runId},data:{settledAt:new Date()}});
    const after = await budgetState(runId,tx);
    return {...after,totalRefunded:after.refunded,refunded:run.settledAt ? 0 : Math.max(0,toNum(remainder))};
  });
  if (!result.pending) publish(runId,{type:'settled',reason,...result});
  return result;
}

// Broker-metered variants. Same ledger math as draw/settle, but admitted for
// confidential runs. Client callers must never import these directly — the only
// legitimate caller is the broker-authenticated internal route.
export function drawPrivate(runId, amount, kind = 'spend', txRef = null) {
  return draw(runId, amount, kind, txRef, { allowConfidential: true });
}

export function settlePrivate(runId, reason) {
  return settle(runId, reason, { allowConfidential: true });
}
