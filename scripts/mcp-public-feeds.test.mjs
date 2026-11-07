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
const siteWhere = { deletedAt: null, isVerified: true, verificationStatus: 'verified' };
const contentWhere = { deletedAt: null, website: siteWhere };

function harness(overrides = {}) {
  const db = {
    content: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null) },
    website: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    nibShare: { findFirst: vi.fn(() => { throw new Error('Private shares must not be enumerated'); }) },
  };
  const deps = {
    db, normalizeContentType: (x) => x, serializeContent: (x) => x,
    sanitizePublicContent: ({ accessPolicy, unlockPolicy, visitorId, ...publicFields }) => publicFields,
    publicContentWhere: () => contentWhere, publicSiteWhere: () => siteWhere,
    getPublicLedger: vi.fn().mockResolvedValue({ success: true, activities: [] }),
    getPublicStats: vi.fn().mockResolvedValue({ success: true, stats: {} }),
    siteReputationScore: () => 0, creatorReputationScore: () => 0,
    primaryWalletAddress: () => null,
    tipRevenueByContentId: vi.fn().mockResolvedValue(new Map()),
    attributeTips: vi.fn().mockResolvedValue({ bySite: new Map(), byOwner: new Map() }),
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

describe('MCP public-feed parity', () => {
  it('delegates ledger and stats to the same shared privacy boundary', async () => {
    const { deps, db, call } = harness();
    const args = { domain: 'example.com', type: 'payments', skip: 4 };
    await call('get_ledger', args);
    await call('get_platform_stats');
    assert.deepEqual(deps.getPublicLedger.mock.calls, [[db, args]]);
    assert.deepEqual(deps.getPublicStats.mock.calls, [[db]]);
  });

  it('filters and sanitizes Explore content', async () => {
    const { db, call } = harness();
    db.content.findMany.mockResolvedValue([{ id: 'public', title: 'A', accessPolicy: 'paid', unlockPolicy: 'one_time', visitorId: 'private' }]);
    const result = await call('explore_content');
    assert.deepEqual(db.content.findMany.mock.calls[0][0].where, contentWhere);
    assert.deepEqual(result.content, [{ id: 'public', title: 'A' }]);
  });

  it('uses eligible content tips and identifies bounded content rankings', async () => {
    const { db, deps, call } = harness();
    db.content.findMany.mockResolvedValue(Array.from({ length: 500 }, (_, i) => ({ id: String(i), views: 0, unlocks: 0, revenue: 0, accessPolicy: 'private' })));
    const result = await call('get_leaderboards', { type: 'content' });
    assert.equal(result.rankingScope, 'first-500-candidates');
    assert.deepEqual(deps.tipRevenueByContentId.mock.calls[0][1], { publicOnly: true });
    assert.ok(!Object.hasOwn(result.items[0], 'accessPolicy'));
  });

  it('restricts site and creator queries and never reads private-share earnings', async () => {
    const { db, deps, call } = harness();
    await call('get_leaderboards', { type: 'sites' });
    await call('get_leaderboards', { type: 'creators' });
    assert.deepEqual(db.website.findMany.mock.calls[0][0].where, siteWhere);
    assert.deepEqual(db.website.findMany.mock.calls[0][0].include.content.where, contentWhere);
    assert.deepEqual(db.user.findMany.mock.calls[0][0].where, { websites: { some: siteWhere } });
    assert.deepEqual(db.user.findMany.mock.calls[0][0].include.websites.include.content.where, contentWhere);
    for (const [args] of deps.attributeTips.mock.calls) assert.equal(args.publicOnly, true);
  });

  it('never automatically publishes a Nibshare slug through x402 discovery', async () => {
    const { db, request } = harness();
    const result = await request('GET /.well-known/x402');
    assert.deepEqual(result.resources, []);
    assert.equal(db.nibShare.findFirst.mock.calls.length, 0);
    assert.deepEqual(db.content.findFirst.mock.calls[0][0].where, { ...contentWhere, price: { gt: 0 } });
  });

  it('advertises the synchronized version and no private-share ledger filter', async () => {
    const { request } = harness();
    const info = await request('GET /mcp');
    assert.equal(info.serverInfo.version, '0.2.15');
    const list = await request('POST /mcp', { id: 1, method: 'tools/list' });
    const ledger = list.result.tools.find((t) => t.name === 'get_ledger');
    assert.ok(!ledger.inputSchema.properties.type.enum.includes('nibshare'));
    assert.ok(ledger.description.includes('Nibshare is excluded'));
  });
});


describe('MCP public errors and cache policy', () => {
  it('returns 503 rather than an empty discovery list on database failure', async () => {
    const { rawRequest } = harness({ db: { content: { findFirst: async () => { throw new Error('private database host'); } } } });
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
