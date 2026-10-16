import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('read-only RPC proxy', () => {
  it('checks mirror chain and uses it after primary rate limit', async () => {
    vi.stubEnv('NIBGATE_NETWORK', 'mainnet');
    vi.stubEnv('ARC_RPC_URL', 'https://primary.test');
    vi.stubEnv('ARC_RPC_FALLBACK_URLS', 'https://mirror.test');
    const fetchMock = vi.fn(async (url, request) => {
      const method = JSON.parse(request.body).method;
      if (url.includes('primary') && method !== 'eth_chainId') return { ok: false, status: 429 };
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: method === 'eth_chainId' ? '0x13b2' : '0x42' }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const { registerRpcRoute } = await import('./rpc-route.js');
    const app = { all: vi.fn() };
    registerRpcRoute(app);
    const handler = app.all.mock.calls[0][1];
    const res = { json: vi.fn(), status: vi.fn() };
    res.status.mockReturnValue(res);
    await handler({ method: 'POST', ip: 'test', body: { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ result: '0x42' }));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('never forwards a write method', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { registerRpcRoute } = await import('./rpc-route.js');
    const app = { all: vi.fn() };
    registerRpcRoute(app);
    const res = { json: vi.fn(), status: vi.fn() };
    res.status.mockReturnValue(res);
    await app.all.mock.calls[0][1]({ method: 'POST', ip: 'other', body: { method: 'eth_sendRawTransaction' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});
