// Onchain settle for escrowed runs: submit the deliverable, complete the job
// with the ledger-attested spend, and sign the split — the contract pays the
// operator the spend and refunds the client the remainder. Runs without an
// escrow job, or deployments without escrow configured, are untouched.
//
// Never throws: a settle failure is recorded on the run (manual
// POST /:id/escrow/complete remains), never allowed to fail the run itself.
import { db } from '../db.js';
import { Prisma } from '@prisma/client';
import { budgetState, settle } from '../money.js';
import { recordEvent } from '../eventlog.js';
import { assertEscrowJobBinding, isEscrowConfigured, jobStatus, signSplit, submitAndComplete } from './jobs.js';
import { isLegacyRun } from '../privacy/guard.js';
import { oldestLegacyRuns } from '../privacy/legacy-pagination.js';

const inFlight = new Set();
export async function settleEscrowRun(runId, reason = 'settle') {
  const candidate=await db.researchRun.findUnique({where:{id:runId},select:{metadata:true}});
  if (!isLegacyRun(candidate)) return {skipped:true,reason:'confidential-boundary-unavailable'};
  if (inFlight.has(runId)) return { pending: true, reason: 'settlement-in-progress' };
  inFlight.add(runId);
  try { return await settleRun(runId, reason); }
  finally { inFlight.delete(runId); }
}

export async function retryPendingSettlements() {
  // Also finish ledger-only runs whose process exited after a terminal
  // status was recorded but before settlement. Active stages still drain.
  const unfinished=await oldestLegacyRuns(db.researchRun.findMany.bind(db.researchRun),{status:{in:['complete','ended','failed']},settledAt:null,steps:{none:{status:'active'}}},{status:true});
  for(const run of unfinished)if(isLegacyRun(run))await settle(run.id,run.status);
  if (!isEscrowConfigured()) return { retried: 0 };
  const runs = await oldestLegacyRuns(db.researchRun.findMany.bind(db.researchRun),{
      status: { in: ['complete', 'ended', 'failed'] },
      AND: [
        { metadata: { path: ['escrow', 'jobId'], not: Prisma.AnyNull } },
        { OR: ['Funded', 'Submitted', 'Completed'].map((status) => ({ metadata: { path: ['escrow', 'status'], equals: status } })) },
        { metadata: { path: ['escrow', 'splitTx'], equals: Prisma.AnyNull } },
        { OR: [
          { metadata: { path: ['escrow', 'splitConfirmed'], equals: Prisma.AnyNull } },
          { metadata: { path: ['escrow', 'splitConfirmed'], equals: false } },
        ] },
      ],
    },{id:true});
  for (const run of runs) await settleEscrowRun(run.id, 'automatic-retry');
  return { retried: runs.length };
}

async function settleRun(runId, reason) {
  try {
    const run = await db.researchRun.findUnique({ where: { id: runId } });
    if (!run || !['complete','ended','failed'].includes(run.status)) return {skipped:true};
    if (!isLegacyRun(run)) return {skipped:true,reason:'confidential-boundary-unavailable'};
    if (await db.researchStep.count({where:{runId,status:'active'}})) return {pending:true,reason:'stage-in-flight'};
    if (!run.settledAt) { const money=await settle(runId,reason); if(money?.pending) return money; }
    const local = run?.metadata?.escrow;
    if (!local?.jobId || local.splitTx || local.splitConfirmed) return { skipped: true };
    if (!isEscrowConfigured()) {
      await recordEvent(runId, { type: 'escrow.settle-skipped', reason: 'escrow not configured on this deployment' });
      return { skipped: true, reason: 'unconfigured' };
    }
    const operator = process.env.ESCROW_OPERATOR || '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(operator)) {
      await recordEvent(runId, { type: 'escrow.settle-skipped', reason: 'ESCROW_OPERATOR is not configured — complete manually via POST /:id/escrow/complete' });
      return { skipped: true, reason: 'no-operator' };
    }
    const report = await db.researchReport.findFirst({ where: { runId }, orderBy: { version: 'desc' } });
    const { keccak256, toHex } = await import('viem');
    const reportHash = report ? keccak256(toHex(report.markdown)) : '0x';
    const { spend } = await budgetState(runId);
    const chain = await jobStatus(local.jobId);
    assertEscrowJobBinding(chain, { client: run.walletAddress });
    const out = await submitAndComplete({ jobId: local.jobId, reportHash, spentUsd: spend, operator });
    const sig = await signSplit({ jobId: local.jobId, spentUsd: spend, operator, client: chain.client });
    // Relay the split too: attesting without executing strands the money
    // (job Completed, splitDone false, refund ledger-only). Never throws —
    // the run stays complete regardless; a failed relay is re-runnable via
    // POST /:id/escrow/complete.
    let splitTx = local.splitTx || null;
    let splitConfirmed = false;
    let settlementError = null;
    try {
      const { relaySplit } = await import('./jobs.js');
      const rel = await relaySplit({ jobId: local.jobId, spentUsd: spend, operator, client: chain.client });
      if (rel?.splitTx) splitTx = rel.splitTx;
      splitConfirmed = Boolean(rel?.splitTx || rel?.alreadySplit);
    } catch (err) {
      settlementError = 'Refund is pending. Settlement will retry; your funds remain in escrow.';
      await recordEvent(runId, { type: 'escrow.split-failed', jobId: local.jobId, error: String(err?.message || err).slice(0, 200) });
    }
    await db.researchRun.update({
      where: { id: runId },
      data: { metadata: { ...(run.metadata || {}), escrow: { ...local, status: 'Completed', completeTx: out?.completeTx || local.completeTx || null, splitSig: sig, splitConfirmed, settlementError, ...(splitTx ? { splitTx } : {}) } } },
    });
    await recordEvent(runId, { type: 'escrow.completed', jobId: local.jobId, completeTx: out?.completeTx || null, reason, ...(splitTx ? { splitTx } : {}) });
    return { completed: splitConfirmed, pending: !splitConfirmed, completeTx: out?.completeTx || local.completeTx || null, splitTx };
  } catch (err) {
    // Move a failed job behind other pending settlements. Otherwise a fixed
    // take:3 oldest batch can retry the same broken jobs forever and starve a
    // newly completed user's refund.
    try { await db.researchRun.update({ where: { id: runId }, data: { updatedAt: new Date() } }); } catch {}
    try {
      await recordEvent(runId, { type: 'escrow.settle-failed', error: String(err?.message || err).slice(0, 300) });
    } catch {}
    return { skipped: true, reason: 'error', error: String(err?.message || err).slice(0, 200) };
  }
}
