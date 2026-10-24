import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({ waitForTransactionReceipt: async () => ({}) })),
  createWalletClient: vi.fn(() => ({
    writeContract: async () => '0xrate1',
  })),
  fallback: vi.fn((transports) => ({ transports })),
  http: vi.fn(() => ({})),
}));
vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({ address: '0xAgent000000000000000000000000000000000001' })),
}));
vi.mock('../money.js', () => ({ budgetState: vi.fn(async () => ({ balance: 5 })) }));
vi.mock('./guard.js', () => ({ crossCheckRpc: vi.fn(async () => ({ ok: true })) }));

import { rateContent } from './ratings.js';

const TEST_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PREP = {
  success: true,
  message: 'Nibgate content rating',
  ratingValue: 50,
  contentHash: '0x' + 'ab'.repeat(32),
  contractAddress: '0x9f27fd62e75f86a3c7addfdba443aab1f930e281',
  chainId: '5042',
  chainName: 'Arc',
  rpcUrl: 'https://rpc.mainnet.arc.io',
};

function hubFetch({ explore = [], prepare = PREP, index = { success: true } } = {}) {
  return async (url, opts = {}) => {
    const u = String(url);
    const json = async (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });
    if (u.includes('/hub/explore/content')) return json({ content: explore });
    if (u.includes('/ratings/prepare')) {
      if (opts?.body && !JSON.parse(opts.body).contentId) return json({ error: 'Missing' }, false);
      return json(typeof prepare === 'function' ? prepare(JSON.parse(opts.body)) : prepare);
    }
    if (u.includes('/ratings/index')) return json(index);
    throw new Error(`unexpected hub call: ${u}`);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DRNIB_AGENT_PRIVATE_KEY', TEST_KEY);
});

describe('rateContent', () => {
  it('refuses without a spending key', async () => {
    vi.stubEnv('DRNIB_AGENT_PRIVATE_KEY', '');
    await expect(rateContent({ runId: 'r', contentId: 'c1', stars: 5, unlockRef: '0xpay' })).rejects.toThrow(/not configured/);
  });

  it('refuses out-of-range stars and missing unlockRef', async () => {
    await expect(rateContent({ runId: 'r', contentId: 'c1', stars: 6, unlockRef: '0xpay' })).rejects.toThrow(/stars must be 1-5/);
    await expect(rateContent({ runId: 'r', contentId: 'c1', stars: 5, unlockRef: '' })).rejects.toThrow(/unlockRef/);
  });

  it('refuses a page the hub has not indexed', async () => {
    const f = hubFetch({ explore: [{ url: 'https://other.example/x', id: 'z' }] });
    await expect(rateContent({ runId: 'r', url: 'https://creator.example/post', stars: 4, unlockRef: '0xpay', fetchImpl: f })).rejects.toThrow(/not indexed/);
  });

  it('refuses when prepare names another chain', async () => {
    const f = hubFetch({ prepare: { ...PREP, chainId: '5042002' } });
    await expect(rateContent({ runId: 'r', contentId: 'c1', stars: 5, unlockRef: '0xpay', fetchImpl: f })).rejects.toThrow(/wrong|another chain|refusing cross-network/i);
  });

  it('prepare → sign → index on the happy path, stars scaled ×10', async () => {
    const calls = [];
    const f = async (url, opts) => {
      calls.push(String(url));
      return hubFetch()(url, opts);
    };
    const out = await rateContent({ runId: 'r', contentId: 'c1', stars: 5, unlockRef: '0xpaytx', fetchImpl: f });
    expect(out.txHash).toBe('0xrate1');
    expect(out.ratingValue).toBe(50);
    expect(out.indexed).toBe(true);
    expect(calls.some((u) => u.includes('/ratings/prepare'))).toBe(true);
    expect(calls.some((u) => u.includes('/ratings/index'))).toBe(true);
  });
});
