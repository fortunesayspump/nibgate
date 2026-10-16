import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./jobs.js', () => ({
  isEscrowConfigured: () => true,
  jobStatus: async () => ({ client: '0x1111111111111111111111111111111111111111' }),
  signSplit: async () => ({ v: 27, r: '0x1', s: '0x2' }),
  submitAndComplete: vi.fn(async () => ({ alreadyCompleted: true })),
  relaySplit: vi.fn(),
}));
vi.mock('../money.js', () => ({ budgetState: async () => ({ spend: 0.1 }), settle:async()=>({pending:false}) }));
import { db } from '../db.js';
import { relaySplit, submitAndComplete } from './jobs.js';
import { settleEscrowRun, retryPendingSettlements } from './settle.js';
const id = 'onboarding-settlement-retry-test';
beforeEach(async () => {
  vi.stubEnv('ESCROW_OPERATOR', '0x2222222222222222222222222222222222222222');
  await db.researchRun.create({ data: { id, brief: {}, status: 'complete', metadata: { escrow: { jobId: '7', status: 'Completed', completeTx: '0xprior' } } } });
  relaySplit.mockReset();
});
afterEach(async () => { await db.researchRun.delete({ where: { id } }); vi.unstubAllEnvs(); });

it('keeps a failed split retryable, then confirms it without losing the completion receipt', async () => {
  relaySplit.mockRejectedValueOnce(new Error('temporary RPC outage'));
  expect((await settleEscrowRun(id)).pending).toBe(true);
  let run = await db.researchRun.findUnique({ where: { id } });
  expect(run.metadata.escrow.splitConfirmed).toBe(false);
  expect(run.metadata.escrow.completeTx).toBe('0xprior');
  relaySplit.mockResolvedValueOnce({ splitTx: '0xsplit' });
  expect((await retryPendingSettlements()).retried).toBeGreaterThan(0);
  run = await db.researchRun.findUnique({ where: { id } });
  expect(run.metadata.escrow.splitTx).toBe('0xsplit');
  expect(run.metadata.escrow.splitConfirmed).toBe(true);
  expect(run.metadata.escrow.completeTx).toBe('0xprior');
});

it('finds legacy completed jobs with a missing split and stops retrying once confirmed', async () => {
  relaySplit.mockResolvedValue({ alreadySplit: true, splitTx: null });
  expect((await retryPendingSettlements()).retried).toBeGreaterThan(0);
  const calls = relaySplit.mock.calls.length;
  await retryPendingSettlements();
  expect(relaySplit.mock.calls.length).toBe(calls);
});

it('retries a completed research run whose escrow is still Funded after a transient chain read', async () => {
  await db.researchRun.update({ where: { id }, data: { metadata: { escrow: { jobId: '7', status: 'Funded' } } } });
  relaySplit.mockResolvedValueOnce({ splitTx: '0xsplit' });
  const out = await retryPendingSettlements();
  expect(out.retried).toBeGreaterThan(0);
  const run = await db.researchRun.findUnique({ where: { id } });
  expect(run.metadata.escrow.status).toBe('Completed');
  expect(run.metadata.escrow.splitTx).toBe('0xsplit');
});

it('does not repeatedly settle a terminal run whose escrow was never funded', async () => {
  await db.researchRun.update({ where: { id }, data: { metadata: { escrow: { jobId: '7', status: 'Open' } } } });
  await retryPendingSettlements();
  const run = await db.researchRun.findUnique({ where: { id } });
  expect(run.metadata.escrow.status).toBe('Open');
});

it('rotates a failed settlement behind other pending jobs', async () => {
  const old = new Date(Date.now() - 10 * 60_000);
  await db.researchRun.update({ where: { id }, data: { updatedAt: old } });
  submitAndComplete.mockRejectedValueOnce(new Error('stale RPC returned Open'));
  expect((await settleEscrowRun(id)).reason).toBe('error');
  const run = await db.researchRun.findUnique({ where: { id } });
  expect(run.updatedAt.getTime()).toBeGreaterThan(old.getTime());
});
