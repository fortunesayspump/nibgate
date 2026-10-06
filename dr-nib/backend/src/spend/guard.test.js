import { beforeEach, describe, expect, it, vi } from 'vitest';

import { crossCheckRpc } from './guard.js';

beforeEach(() => vi.unstubAllEnvs());

describe('crossCheckRpc', () => {
  it('skips silently without a backup endpoint', async () => {
    expect(await crossCheckRpc({ chainId: 5042002, rpcUrl: 'https://a.example' })).toEqual({ ok: true, skipped: true });
  });

  it('passes when both RPCs agree', async () => {
    vi.stubEnv('DRNIB_RPC_BACKUP', 'https://b.example');
    const both = async (url, { body } = {}) => {
      const { method } = JSON.parse(body);
      if (method === 'eth_chainId') return { ok: true, json: async () => ({ result: '0x4cef52' }) };
      return { ok: true, json: async () => ({ result: '0x3ea1919' }) };
    };
    expect(await crossCheckRpc({ chainId: 5042002, rpcUrl: 'https://a.example', fetchImpl: both })).toEqual({ ok: true, skipped: false });
  });

  it('refuses on chain id disagreement (injected-state defense)', async () => {
    vi.stubEnv('DRNIB_RPC_BACKUP', 'https://evil.example');
    const split = async (url, { body } = {}) => {
      const { method } = JSON.parse(body);
      if (method === 'eth_chainId') {
        return { ok: true, json: async () => ({ result: String(url).includes('evil') ? '0x1' : '0x4cef52' }) };
      }
      return { ok: true, json: async () => ({ result: '0x3ea1919' }) };
    };
    await expect(crossCheckRpc({ chainId: 5042002, rpcUrl: 'https://a.example', fetchImpl: split })).rejects.toThrow(/chain id disagreement/);
  });

  it('refuses on stale backup height', async () => {
    vi.stubEnv('DRNIB_RPC_BACKUP', 'https://b.example');
    const stale = async (url, { body } = {}) => {
      const { method } = JSON.parse(body);
      if (method === 'eth_chainId') return { ok: true, json: async () => ({ result: '0x4cef52' }) };
      return { ok: true, json: async () => ({ result: String(url).includes('b.example') ? '0x1' : '0x3ea1919' }) };
    };
    await expect(crossCheckRpc({ chainId: 5042002, rpcUrl: 'https://a.example', fetchImpl: stale })).rejects.toThrow(/block height disagreement/);
  });
});
