// Onchain settle for escrowed runs: submit the deliverable, complete the job
// with the ledger-attested spend, and sign the split — the contract pays the
// operator the spend and refunds the client the remainder. Runs without an
// escrow job, or deployments without escrow configured, are untouched.
//
// Never throws: a settle failure is recorded on the run (manual
// POST /:id/escrow/complete remains), never allowed to fail the run itself.
import { db } from '../db.js';
import { budgetState } from '../money.js';
import { recordEvent } from '../eventlog.js';
import { isEscrowConfigured, jobStatus, signSplit, submitAndComplete } from './jobs.js';

export async function settleEscrowRun(runId, reason = 'settle') {
  try {
    const run = await db.researchRun.findUnique({ where: { id: runId } });
    const local = run?.metadata?.escrow;
    if (!local?.jobId || local.status === 'Completed') return { skipped: true };
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
    const out = await submitAndComplete({ jobId: local.jobId, reportHash, spentUsd: spend, operator });
    const chain = await jobStatus(local.jobId);
    const sig = await signSplit({ jobId: local.jobId, spentUsd: spend, operator, client: chain.client });
    await db.researchRun.update({
      where: { id: runId },
      data: { metadata: { ...(run.metadata || {}), escrow: { ...local, status: 'Completed', completeTx: out?.completeTx || null, splitSig: sig } } },
    });
    await recordEvent(runId, { type: 'escrow.completed', jobId: local.jobId, completeTx: out?.completeTx || null, reason });
    return { completed: true, completeTx: out?.completeTx || null };
  } catch (err) {
    try {
      await recordEvent(runId, { type: 'escrow.settle-failed', error: String(err?.message || err).slice(0, 300) });
    } catch {}
    return { skipped: true, reason: 'error', error: String(err?.message || err).slice(0, 200) };
  }
}
