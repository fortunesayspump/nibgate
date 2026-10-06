import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@circle-fin/x402-batching/client', () => ({ GatewayClient: vi.fn() }));
vi.mock('../money.js', () => ({ budgetState: vi.fn(async () => ({ balance: 5 })) }));

import { GatewayClient } from '@circle-fin/x402-batching/client';
import { payX402 } from './unlocks.js';

const TEST_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function challengeFetch() {
  const body = {
    x402Version: 2,
    accepts: [{ scheme: 'exact', network: 'eip155:5042002', maxAmountRequired: '10000', asset: '0x3600000000000000000000000000000000000000' }],
  };
  return async () => ({
    status: 402,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DRNIB_AGENT_PRIVATE_KEY', TEST_KEY);
  vi.stubEnv('DRNIB_SPEND_MAX_X402', '2');
});

describe('payX402 buyer path', () => {
  it('previews price, funds gateway, and forwards the POST body', async () => {
    const pay = vi.fn(async () => ({ data: { results: ['r'] }, formattedAmount: '0.01', transaction: '0xabc', status: 200 }));
    vi.mocked(GatewayClient).mockImplementation(() => ({
      onBeforePaymentCreation: vi.fn(),
      getBalances: async () => ({ gateway: { available: 1000000n }, wallet: { balance: 0n, formatted: '0' } }),
      pay,
    }));
    const out = await payX402({ runId: 'probe', url: 'https://seller.example/x402/search', body: { query: 'arc usdc' }, fetchImpl: challengeFetch() });
    expect(pay).toHaveBeenCalledTimes(1);
    const [url, opts] = vi.mocked(pay).mock.calls[0];
    expect(url).toBe('https://seller.example/x402/search');
    expect(opts.method).toBe('POST');
    expect(opts.body).toEqual({ query: 'arc usdc' });
    expect(out.amount).toBe(0.01);
    expect(out.txHash).toBe('0xabc');
    expect(out.data).toEqual({ results: ['r'] });
  });

  it('refuses when no readable price is on the 402', async () => {
    const empty = async () => ({ status: 402, headers: { get: () => null }, text: async () => '{}' });
    await expect(payX402({ runId: 'probe', url: 'https://seller.example/x', fetchImpl: empty })).rejects.toThrow(/no readable price/);
    expect(vi.mocked(GatewayClient)).not.toHaveBeenCalled();
  });
});
