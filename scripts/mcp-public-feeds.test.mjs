import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function spy(implementation = () => undefined) {
  const fn = (...args) => { fn.mock.calls.push(args); return implementation(...args); };
  fn.mock = { calls: [] };
  fn.mockResolvedValue = (value) => { implementation = async () => value; return fn; };
  return fn;
}
const vi = { fn: spy };
import { readFileSync } from 'node:fs';

// Dependency-injected route harness: exercises real MCP handlers without a DB,
// wallet SDK, network connection, or payment configuration.
const source = readFileSync(new URL('../backend/src/server/mcp.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export function registerMcpRoute', 'function registerMcpRoute');
function harness(overrides = {}) {
  const db = {
    content: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null) },
    website: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    nibShare: { findFirst: vi.fn(() => { throw new Error('Private shares must not be enumerated'); }) },
  };
  const deps = {
    db,
    getPublicDiscovery: vi.fn().mockResolvedValue({ success: true, content: [], scope: 'current-public-creator-articles' }),
    getPublicLedger: vi.fn().mockResolvedValue({ success: true }),
    getPublicLeaderboards: vi.fn().mockResolvedValue({ success: true }),
    getPublicStats: vi.fn().mockResolvedValue({ success: true, stats: { sites: 0, content: 0, creators: null, views: null } }),
    shareManifest: vi.fn(), activeNetwork: () => ({ name: 'mainnet', isTestnet: false }),
    hostsFor: () => ({ apiBase: 'https://api.nibgate.xyz' }), ...overrides,
  };
  const register = new Function(...Object.keys(deps), `${source}\nreturn registerMcpRoute;`)(...Object.values(deps));
  const handlers = {};
  register({ get: (p, h) => { handlers[`GET ${p}`] = h; }, post: (p, h) => { handlers[`POST ${p}`] = h; } });
  async function rawRequest(path, body = {}) {
    const res = {
      statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      type() { return this; }, json(value) { this.body = value; return this; },
    };
    await handlers[path]({ body }, res);
    return res;
  }
  async function request(path, body = {}) {
    return (await rawRequest(path, body)).body;
  }
  async function call(name, args = {}) {
    const response = await request('POST /mcp', { id: 1, method: 'tools/call', params: { name, arguments: args } });
    assert.notEqual(response.result.isError, true);
    return JSON.parse(response.result.content[0].text);
  }
  return { deps, db, call, request, rawRequest };
}

describe('MCP current-public-source parity', () => {
  it('delegates discovery and stats with the active network', async () => {
    const { deps, db, call } = harness();
    const args = { q: 'test', sort: 'best-sellers' };
    await call('explore_content', args);
    const stats = await call('get_platform_stats');
    assert.deepEqual(deps.getPublicDiscovery.mock.calls, [[db, args, { network: 'mainnet' }]]);
    assert.deepEqual(deps.getPublicStats.mock.calls, [[db, { network: 'mainnet' }]]);
    assert.equal(stats.stats.views, null);
    assert.equal(stats.stats.creators, null);
    assert.equal(db.content.findMany.mock.calls.length, 0);
  });

  it('delegates ledger and rankings without querying old records', async () => {
    const unavailable = async () => { throw Object.assign(new Error('internal details'), { status: 503, code: 'event-visibility-unavailable' }); };
    const { db, request } = harness({ getPublicLedger: unavailable, getPublicLeaderboards: unavailable });
    for (const name of ['get_ledger', 'get_leaderboards']) {
      const res = await request('POST /mcp', { id: 1, method: 'tools/call', params: { name } });
      assert.equal(res.result.isError, true);
      assert.match(res.result.content[0].text, /event-visibility-unavailable/);
      assert.ok(!JSON.stringify(res).includes('internal details'));
    }
    for (const model of Object.values(db)) for (const method of Object.values(model)) assert.equal(method.mock.calls.length, 0);
  });

  it('x402 lists only safe paid URLs from the fresh public discovery service', async () => {
    const getPublicDiscovery = vi.fn().mockResolvedValue({ content: [
      { price: 1, url: 'https://creator.example/article' },
      { price: 0, url: 'https://creator.example/free' },
      { price: 1, url: 'https://nibgate.xyz/ns/private' },
      { price: 1, url: 'http://creator.example/insecure' },
      { price: 1, url: 'https://user:password@creator.example/private' },
    ] });
    const { request, db } = harness({ getPublicDiscovery });
    const result = await request('GET /.well-known/x402');
    assert.deepEqual(result.resources, ['https://creator.example/article']);
    assert.deepEqual(getPublicDiscovery.mock.calls, [[db, { limit: 100, type: 'article' }, { network: 'mainnet' }]]);
    assert.equal(db.content.findFirst.mock.calls.length, 0);
    assert.equal(db.nibShare.findFirst.mock.calls.length, 0);
  });

  it('advertises the synchronized version and current source limitations', async () => {
    const { request } = harness();
    const info = await request('GET /mcp');
    assert.equal(info.serverInfo.version, '0.2.16');
    assert.match(info.instructions, /latest 20 articles per site/);
    const list = await request('POST /mcp', { id: 1, method: 'tools/list' });
    assert.match(list.result.tools.find(t => t.name === 'get_leaderboards').description, /unavailable/);
  });
});

describe('MCP public errors and cache policy', () => {
  it('returns 503 rather than an empty discovery list on database failure', async () => {
    const { rawRequest } = harness({ getPublicDiscovery: async () => { throw new Error('private database host'); } });
    const res = await rawRequest('GET /.well-known/x402');
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.ok(!Object.hasOwn(res.body, 'resources'));
    assert.ok(!JSON.stringify(res.body).includes('private database host'));
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  it('withholds raw errors from ledger and explicit share resolution', async () => {
    const fail = async () => { throw new Error('private database host'); };
    const { rawRequest } = harness({ getPublicLedger: fail, shareManifest: fail });
    for (const name of ['get_ledger', 'resolve_share']) {
      const res = await rawRequest('POST /mcp', { id: 1, method: 'tools/call', params: { name, arguments: { slug: 'example' } } });
      assert.equal(res.body.result.isError, true);
      assert.ok(!JSON.stringify(res.body).includes('private database host'));
      assert.equal(res.headers['Cache-Control'], 'no-store');
    }
  });

  it('preserves useful application-defined share errors', async () => {
    const { call } = harness();
    assert.match((await call('resolve_share')).error, /Provide a Nibshare slug/);
    assert.match((await call('resolve_share', { slug: 'example' })).error, /No share found/);
  });

  it('marks handshake, server card, and tool responses no-store', async () => {
    const { rawRequest } = harness();
    for (const path of ['GET /mcp', 'GET /.well-known/mcp.json', 'POST /mcp']) {
      const res = await rawRequest(path, { id: 1, method: 'tools/list' });
      assert.equal(res.headers['Cache-Control'], 'no-store');
    }
  });
});
