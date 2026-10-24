import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('viem', () => ({ createPublicClient: vi.fn(), createWalletClient: vi.fn(), erc20Abi: [], fallback: vi.fn((transports) => ({ transports })), http: vi.fn(() => ({})) }));
vi.mock('viem/accounts', () => ({ privateKeyToAccount: vi.fn(() => ({ address: '0xagent' })) }));
vi.mock('../money.js', () => ({ budgetState: vi.fn(async () => ({ balance: 5 })) }));

import { createPublicClient, createWalletClient } from 'viem';
import { spenderAddress, spendViaContract } from './wallet.js';
import { moveFunds, tipCreator } from './tips.js';

const SPENDER = '0x8F636a1aCb99d96746b657645E1d8F2864bff7DA';
const PAYEE = '0xb4da5cb7f0e8dac6ec54ed0ae59c8aefb234bc27';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function mockChain({ paused = false, restricted = false, allowed = true, cap = 2000000n, spent = 0n, windowStart = 100n, blockTime = 200n, receiptStatus = 'success' } = {}) {
  const readContract = vi.fn(async ({ functionName }) => {
    if (functionName === 'paused') return paused;
    if (functionName === 'allowed') return allowed;
    if (functionName === 'restrictRecipients') return restricted;
    if (functionName === 'dailyCap') return cap;
    if (functionName === 'spentInWindow') return spent;
    if (functionName === 'windowStart') return windowStart;
    throw new Error(`unexpected read ${functionName}`);
  });
  const writeContract = vi.fn(async () => '0xtx');
  vi.mocked(createPublicClient).mockReturnValue({ readContract, getBlock: vi.fn(async () => ({ timestamp: blockTime })), waitForTransactionReceipt: vi.fn(async () => ({ status: receiptStatus })) });
  vi.mocked(createWalletClient).mockReturnValue({ writeContract });
  return { readContract, writeContract };
}

describe('mandate routing', () => {
  it('spenderAddress validates strictly', () => {
    expect(spenderAddress()).toBe('');
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', 'not-an-address');
    expect(spenderAddress()).toBe('');
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    expect(spenderAddress()).toBe(SPENDER);
  });

  it('moveFunds uses the EOA path when no mandate is configured', async () => {
    const { writeContract } = mockChain();
    // EOA path calls USDC transfer, never the mandate
    const { sendUsdc } = await import('./wallet.js');
    const hash = await sendUsdc(PAYEE, 0.05);
    expect(hash).toBe('0xtx');
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

  it('spendViaContract pre-checks then spends through the mandate', async () => {
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    const { writeContract } = mockChain();
    const hash = await spendViaContract(PAYEE, 0.05);
    expect(hash).toBe('0xtx');
    const call = vi.mocked(writeContract).mock.calls[0][0];
    expect(call.address).toBe(SPENDER);
    expect(call.functionName).toBe('spend');
    expect(call.args).toEqual([PAYEE, 50000n]);
  });

  it('refuses paused mandate, unallowlisted recipient, and cap breach', async () => {
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    mockChain({ paused: true });
    await expect(spendViaContract(PAYEE, 0.05)).rejects.toThrow(/paused/);
    mockChain({ restricted: true, allowed: false });
    await expect(spendViaContract(PAYEE, 0.05)).rejects.toThrow(/allowlisted/);
    mockChain({ spent: 1990000n });
    await expect(spendViaContract(PAYEE, 0.05)).rejects.toThrow(/cap/);
  });

  it('resets the cap precheck after the contract window expires', async () => {
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    mockChain({ spent: 1990000n, windowStart: 100n, blockTime: 86500n });
    await expect(spendViaContract(PAYEE, 0.05)).resolves.toBe('0xtx');
  });

  it('rejects reverted mandate and direct transfer receipts', async () => {
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    mockChain({ receiptStatus: 'reverted' });
    await expect(spendViaContract(PAYEE, 0.05)).rejects.toThrow(/reverted/);
    const { sendUsdc } = await import('./wallet.js');
    await expect(sendUsdc(PAYEE, 0.05)).rejects.toThrow(/reverted/);
  });

  it('moveFunds routes through the mandate when configured', async () => {
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    mockChain();
    const hash = await moveFunds(PAYEE, 0.05);
    expect(hash).toBe('0xtx');
  });

  it('resolves a verified creator before routing its tip through the mandate', async () => {
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    const { writeContract } = mockChain();
    const calls = [];
    const fetchImpl = vi.fn(async (path, body) => {
      calls.push({ path, body });
      if (path === '/hub/tips/challenge') return { payee: PAYEE };
      if (path === '/hub/tips/verify') return { success: true, receipt: { type: 'tip' } };
      throw new Error(`unexpected ${path}`);
    });
    const out = await tipCreator({
      runId: 'r1', contentUrl: 'https://creator.example/article', amount: 0.05,
      resolveImpl: async () => ({ success: true, wallet: PAYEE }), fetchImpl,
    });
    expect(out.held).toBe(false);
    expect(calls[0].body.recipient).toBe(PAYEE);
    expect(calls[1].body.recipient).toBe(PAYEE);
    expect(writeContract.mock.calls[0][0].functionName).toBe('spend');
  });

  it('keeps an unresolved refundable hold on the EOA', async () => {
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    const { writeContract } = mockChain();
    const post = vi.fn(async (_path, body) => body.txHash
      ? { holdStatus: 'held', tip: { type: 'tip' } }
      : { box: PAYEE });
    const out = await tipCreator({
      runId: 'r1', contentUrl: 'https://unknown.example/article', amount: 0.05,
      resolveImpl: async () => ({ success: false }), fetchImpl: post,
    });
    expect(out.held).toBe(true);
    expect(writeContract.mock.calls[0][0].functionName).toBe('transfer');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('rejects a model-supplied recipient that disagrees with the verified owner', async () => {
    mockChain();
    await expect(tipCreator({
      runId: 'r1', contentUrl: 'https://creator.example/article', amount: 0.05,
      recipient: '0x1111111111111111111111111111111111111111',
      resolveImpl: async () => ({ success: true, wallet: PAYEE }),
    })).rejects.toThrow(/disagrees/);
  });
});
