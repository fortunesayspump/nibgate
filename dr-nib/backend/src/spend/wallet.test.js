import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('viem', () => ({ createPublicClient: vi.fn(), createWalletClient: vi.fn(), erc20Abi: [], http: vi.fn() }));
vi.mock('viem/accounts', () => ({ privateKeyToAccount: vi.fn(() => ({ address: '0xagent' })) }));
vi.mock('../money.js', () => ({ budgetState: vi.fn(async () => ({ balance: 5 })) }));

import { createPublicClient, createWalletClient } from 'viem';
import { spenderAddress, spendViaContract } from './wallet.js';
import { moveFunds } from './tips.js';

const SPENDER = '0x903b0606da40d99d78da9d9be6c435acacba5cf0';
const PAYEE = '0xb4da5cb7f0e8dac6ec54ed0ae59c8aefb234bc27';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function mockChain({ paused = false, allowed = true, cap = 2000000n, spent = 0n } = {}) {
  const readContract = vi.fn(async ({ functionName }) => {
    if (functionName === 'paused') return paused;
    if (functionName === 'allowed') return allowed;
    if (functionName === 'dailyCap') return cap;
    if (functionName === 'spentInWindow') return spent;
    throw new Error(`unexpected read ${functionName}`);
  });
  const writeContract = vi.fn(async () => '0xtx');
  vi.mocked(createPublicClient).mockReturnValue({ readContract, waitForTransactionReceipt: vi.fn(async () => ({})) });
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
    mockChain({ allowed: false });
    await expect(spendViaContract(PAYEE, 0.05)).rejects.toThrow(/allowlisted/);
    mockChain({ spent: 1990000n });
    await expect(spendViaContract(PAYEE, 0.05)).rejects.toThrow(/cap/);
  });

  it('moveFunds routes through the mandate when configured', async () => {
    vi.stubEnv('DRNIB_SPENDER_ADDRESS', SPENDER);
    mockChain();
    const hash = await moveFunds(PAYEE, 0.05);
    expect(hash).toBe('0xtx');
  });
});
