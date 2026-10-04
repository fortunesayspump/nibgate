import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJob, jobStatus, submitAndComplete, signSplit, isEscrowConfigured } from './jobs.js';

beforeEach(() => vi.unstubAllEnvs());

const NET = { network: 'testnet' };

const SIG = '0x' + '22'.repeat(64) + '1c';

describe('escrow config', () => {
  it('is off without a keeper key', () => {
    expect(isEscrowConfigured(undefined, 'testnet')).toBe(false);
  });

  it('resolves testnet deployments by default', async () => {
    vi.stubEnv('ESCROW_KEEPER_KEY', '0x' + '22'.repeat(32));
    expect(isEscrowConfigured(undefined, 'testnet')).toBe(true);
  });
});

describe('job validation (no chain)', () => {
  it('refuses a job without a client wallet', async () => {
    vi.stubEnv('ESCROW_KEEPER_KEY', '0x' + '22'.repeat(32));
    await expect(createJob({ budget: 2 }, NET)).rejects.toThrow(/client wallet/);
  });

  it('refuses a job without a budget', async () => {
    vi.stubEnv('ESCROW_KEEPER_KEY', '0x' + '22'.repeat(32));
    await expect(createJob({ client: '0x1111111111111111111111111111111111111111' }, NET)).rejects.toThrow(/budget/);
  });
});

describe('job reads and signatures (injected chain)', () => {
  const job = {
    status: 1,
    client: '0x1111111111111111111111111111111111111111',
    provider: '0x2222222222222222222222222222222222222222',
    evaluator: '0x3333333333333333333333333333333333333333',
    budget: 2500000n,
    token: '0x3600000000000000000000000000000000000000',
  };
  const make = {
    account: { address: '0x3333333333333333333333333333333333333333', signMessage: async () => SIG },
    public: {
      readContract: async ({ functionName }) => (functionName === 'getJob' ? job : 0n),
      waitForTransactionReceipt: async () => ({ status: 'success' }),
    },
    wallet: { writeContract: async () => '0xhash' },
  };

  it('maps numeric status to names', async () => {
    vi.stubEnv('ESCROW_KEEPER_KEY', '0x' + '22'.repeat(32));
    const out = await jobStatus('7', { make, ...NET });
    expect(out.status).toBe('Funded');
    expect(out.budget).toBe(2.5);
  });

  it('signs a split attestation anyone can execute', async () => {
    vi.stubEnv('ESCROW_KEEPER_KEY', '0x' + '22'.repeat(32));
    const out = await signSplit({ jobId: '7', spentUsd: 1.2, operator: '0x4444444444444444444444444444444444444444', client: job.client }, { make, ...NET });
    expect(out.v).toBe(28);
    expect(out.r).toHaveLength(66);
    expect(out.treasury).toBe('0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12');
  });

  it('settles an already-submitted job without re-submitting', async () => {
    vi.stubEnv('ESCROW_KEEPER_KEY', '0x' + '22'.repeat(32));
    const submitted = { ...job, status: 2 };
    const make2 = { ...make, public: { ...make.public, readContract: async () => submitted } };
    const writes = [];
    make2.wallet = { writeContract: async (tx) => { writes.push(tx.functionName); return '0xhash'; } };
    const out = await submitAndComplete({ jobId: '7', reportHash: '0x' + 'ab'.repeat(32), spentUsd: 1.2 }, { make: make2, ...NET });
    expect(writes).toEqual(['complete']);
    expect(out.completeTx).toBe('0xhash');
  });

  it('refuses to settle from Open', async () => {
    vi.stubEnv('ESCROW_KEEPER_KEY', '0x' + '22'.repeat(32));
    const open = { ...job, status: 0 };
    const make2 = { ...make, public: { ...make.public, readContract: async () => open } };
    await expect(submitAndComplete({ jobId: '7', reportHash: '0x', spentUsd: 0 }, { make: make2, ...NET })).rejects.toThrow(/Open/);
  });
});
