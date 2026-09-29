import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  website: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  wallet: { findUnique: vi.fn() },
  publisherIdentity: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  blogPost: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

vi.mock('@nibgate/internal/db.js', () => ({ db: dbMock }));
vi.mock('../hub/monitors.js', () => ({
  startVerificationMonitor: vi.fn(),
  startManifestSyncMonitor: vi.fn(),
  startReputationIndexer: vi.fn(),
  startDataIntegrityMonitor: vi.fn(),
  startGscSitemapMonitor: vi.fn(),
  startGscIndexMonitor: vi.fn(),
}));
vi.mock('../revenue/keeper.js', () => ({ startFeeKeeper: vi.fn() }));

process.env.NIBGATE_DISABLE_KEEPER = 'true';

import { registerHubRoutes } from './hub-routes.js';

function stubApp() {
  const handlers = {};
  const capture = (method) => (path, ...fns) => { handlers[`${method} ${path}`] = fns[fns.length - 1]; };
  return {
    handlers,
    app: { get: capture('GET'), post: capture('POST'), put: capture('PUT'), patch: capture('PATCH'), delete: capture('DELETE'), options: capture('OPTIONS'), use: () => {} },
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('hub routes: cross-stack identity surface', () => {
  const ORIG_NETWORK = process.env.NIBGATE_NETWORK;
  const ORIG_SECRET = process.env.BLOG_LINK_SECRET;
  const ORIG_PEER = process.env.NIBGATE_PEER_HUB_URL;
  let handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    const { app, handlers: h } = stubApp();
    registerHubRoutes(app);
    handlers = h;
    process.env.NIBGATE_NETWORK = 'mainnet';
    process.env.BLOG_LINK_SECRET = 'test-peer-secret';
    process.env.NIBGATE_PEER_HUB_URL = '';
  });

  afterEach(() => {
    process.env.NIBGATE_NETWORK = ORIG_NETWORK;
    process.env.BLOG_LINK_SECRET = ORIG_SECRET;
    process.env.NIBGATE_PEER_HUB_URL = ORIG_PEER;
    vi.unstubAllGlobals();
  });

  it('mounts the identity endpoints (catches undefined refs at call time)', () => {
    expect(typeof handlers['GET /api/hub/site/verify-status']).toBe('function');
    expect(typeof handlers['GET /api/hub/site/verified-identities']).toBe('function');
    expect(typeof handlers['POST /api/hub/site/sync-from-peer']).toBe('function');
  });

  it('verify-status returns identity for verified sites', async () => {
    dbMock.website.findFirst.mockResolvedValue({
      id: 'w1', domain: 'custom.com', name: 'Custom', ownerId: 'u1',
      isVerified: true, verificationStatus: 'verified', verificationSource: 'widget', lastVerifiedAt: new Date('2026-09-01T00:00:00Z'),
    });
    dbMock.user.findUnique.mockResolvedValue({ id: 'u1', walletAddress: '0x0000000000000000000000000000000000000001', wallets: [{ address: '0x0000000000000000000000000000000000000001' }] });
    dbMock.publisherIdentity.findFirst.mockResolvedValue({ externalId: 'e1', handle: 'custom', name: 'Custom', walletAddress: '0x0000000000000000000000000000000000000001' });

    const res = mockRes();
    await handlers['GET /api/hub/site/verify-status']({ query: { domain: 'custom.com' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.ownerWallets).toEqual(['0x0000000000000000000000000000000000000001']);
    expect(res.body.publisher.handle).toBe('custom');
  });

  it('verified-identities enforces the peer secret', async () => {
    const denied = mockRes();
    await handlers['GET /api/hub/site/verified-identities']({ headers: {}, body: {}, query: {} }, denied);
    expect(denied.statusCode).toBe(403);

    dbMock.website.findMany.mockResolvedValue([]);
    const allowed = mockRes();
    await handlers['GET /api/hub/site/verified-identities']({ headers: { 'x-peer-secret': 'test-peer-secret' }, body: {}, query: {} }, allowed);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body.sites).toEqual([]);
  });

  it('sync-from-peer all:true mirrors translated identities (the prod path)', async () => {
    const peerIndex = {
      ok: true,
      json: async () => ({
        sites: [{
          domain: 'smalltalk.testnet.nibgate.xyz', name: 'Smalltalk', verificationStatus: 'verified',
          lastVerifiedAt: '2026-09-20T00:00:00Z',
          ownerWallets: ['0x0000000000000000000000000000000000000007'],
          publisher: { externalId: 'ext1', handle: 'smalltalk' },
        }],
      }),
    };
    vi.stubGlobal('fetch', vi.fn(async () => peerIndex));

    dbMock.website.findFirst.mockResolvedValue(null);
    dbMock.wallet.findUnique.mockResolvedValue(null);
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({ id: 'owner1' });
    dbMock.website.create.mockResolvedValue({ id: 'w9', domain: 'smalltalk.nibgate.xyz' });
    dbMock.publisherIdentity.findUnique.mockResolvedValue(null);
    dbMock.publisherIdentity.create.mockResolvedValue({});

    const res = mockRes();
    await handlers['POST /api/hub/site/sync-from-peer'](
      { headers: { 'x-peer-secret': 'test-peer-secret' }, body: { all: true }, query: {} },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.synced).toHaveLength(1);
    expect(res.body.synced[0].localDomain).toBe('smalltalk.nibgate.xyz');
    expect(dbMock.website.create.mock.calls[0][0].data.ownerId).toBe('owner1');
  });

  it('sync-from-peer rejects without secret and validates body', async () => {    const denied = mockRes();
    await handlers['POST /api/hub/site/sync-from-peer']({ headers: {}, body: { all: true }, query: {} }, denied);
    expect(denied.statusCode).toBe(403);

    const bad = mockRes();
    await handlers['POST /api/hub/site/sync-from-peer']({ headers: { 'x-peer-secret': 'test-peer-secret' }, body: {}, query: {} }, bad);
    expect(bad.statusCode).toBe(400);
  });

  it('sync-from-peer all:true mirrors published blog posts with bodies', async () => {
    const authorWallet = '0x00000000000000000000000000000000000000aa';
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/blog/posts/')) {
        return { ok: true, json: async () => ({ post: { slug: 'hello', title: 'Hello', bodyMarkdown: 'Body text here, long enough.', excerpt: 'Hi', tag: 'Company', tags: ['a'], coverUrl: '', status: 'published', publishedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', author: { walletAddress: authorWallet } } }) };
      }
      if (String(url).includes('/api/blog/posts')) {
        return { ok: true, json: async () => ({ posts: [{ slug: 'hello', title: 'Hello', status: 'published' }] }) };
      }
      return { ok: true, json: async () => ({ sites: [] }) };
    }));

    dbMock.wallet.findUnique.mockResolvedValue(null);
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({ id: 'author1' });
    dbMock.blogPost.findUnique.mockResolvedValue(null);
    dbMock.blogPost.create.mockResolvedValue({ id: 'p1', slug: 'hello' });

    const res = mockRes();
    await handlers['POST /api/hub/site/sync-from-peer'](
      { headers: { 'x-peer-secret': 'test-peer-secret' }, body: { all: true }, query: {} },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.blogPosts.synced).toEqual([{ slug: 'hello' }]);
    expect(dbMock.blogPost.create.mock.calls[0][0].data.bodyMarkdown).toContain('Body text');
  });
});

describe('hub routes: JEV proposer', () => {
  let handlers;
  const ORIG = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of ['JEV_LLM_PROVIDER', 'OPENROUTER_API_KEY', 'JEV_MODEL']) {
      ORIG[k] = process.env[k];
      delete process.env[k];
    }
    const { app, handlers: h } = stubApp();
    registerHubRoutes(app);
    handlers = h;
  });

  afterEach(() => {
    for (const k of ['JEV_LLM_PROVIDER', 'OPENROUTER_API_KEY', 'JEV_MODEL']) {
      if (ORIG[k] === undefined) delete process.env[k];
      else process.env[k] = ORIG[k];
    }
    vi.unstubAllGlobals();
  });

  const goodBody = () => ({
    task: 'Pick the tip recipient for this page',
    candidates: [
      { id: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', kind: 'wallet', cost: 0, context: 'author byline on the page' },
      { id: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', kind: 'wallet', cost: 0, context: 'footer link' },
    ],
    signals: ['relevance', 'confidence'],
  });

  it('rejects missing/invalid bodies', async () => {
    for (const body of [
      {},
      { task: 'x' },
      { task: 'x', candidates: [], signals: ['a'] },
      { task: 'x', candidates: new Array(13).fill({ id: 'a', kind: 'w', cost: 0, context: 'c' }), signals: ['a'] },
      { ...goodBody(), signals: [] },
      { ...goodBody(), candidates: [{ id: '', kind: 'w', cost: 0, context: 'c' }] },
    ]) {
      const res = mockRes();
      await handlers['POST /api/hub/jev/propose']({ headers: {}, body, query: {} }, res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('scores candidates through the configured model', async () => {
    process.env.JEV_LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"options":[{"id":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","scores":{"relevance":0.9,"confidence":0.8}}]}' } }] }),
      text: async () => '{}',
    })));
    const res = mockRes();
    await handlers['POST /api/hub/jev/propose']({ headers: {}, body: goodBody(), query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.model).toBe('typesafe/jev-router');
    expect(res.body.options).toHaveLength(1);
    expect(res.body.options[0].id).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(res.body.options[0].scores.relevance).toBe(0.9);
  });

  it('surfaces provider failures as 502', async () => {
    process.env.JEV_LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}), text: async () => 'slow down' })));
    const res = mockRes();
    await handlers['POST /api/hub/jev/propose']({ headers: {}, body: goodBody(), query: {} }, res);
    expect(res.statusCode).toBe(502);
  });
});

describe('hub routes: JEV decisions', () => {
  let handlers;
  const ORIG = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of ['JEV_DECISIONS_MODEL', 'JEV_DECISIONS_URL', 'OPENROUTER_API_KEY']) {
      ORIG[k] = process.env[k];
      delete process.env[k];
    }
    const { app, handlers: h } = stubApp();
    registerHubRoutes(app);
    handlers = h;
  });

  afterEach(() => {
    for (const k of ['JEV_DECISIONS_MODEL', 'JEV_DECISIONS_URL', 'OPENROUTER_API_KEY']) {
      if (ORIG[k] === undefined) delete process.env[k];
      else process.env[k] = ORIG[k];
    }
    vi.unstubAllGlobals();
  });

  const body = (over = {}) => ({
    state: 'External coffee blog. Byline: 0xaaaa. Footer link: 0xbbbb.',
    instructions: 'Choose the wallet that belongs to the creator/author.',
    questionId: 'recipient',
    candidates: [
      { id: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', context: 'author byline next to the title' },
      { id: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', context: 'generic footer payment link' },
    ],
    ...over,
  });

  it('rejects invalid bodies', async () => {
    for (const b of [
      {},
      { state: 'x' },
      { state: 'x', instructions: 'y', candidates: [{ id: '0xaa', context: 'c' }] }, // < 2 candidates
      { state: 'x', instructions: 'y', candidates: new Array(13).fill({ id: 'a', context: 'c' }) },
      { state: 'x', instructions: 'y', candidates: [{ id: '', context: 'c' }, { id: 'b', context: 'c' }] },
      { state: 'x', instructions: '', candidates: [{ id: 'a', context: 'c' }, { id: 'b', context: 'c' }] },
    ]) {
      const res = mockRes();
      await handlers['POST /api/hub/jev/decide']({ headers: {}, body: b, query: {} }, res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('returns the decisions model pick', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    let seenUrl = '';
    let seenBody = {};
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'typesafe/jev-1.13-20260917',
          provider: 'TypeSafe',
          answers: { recipient: { type: 'choice', choice: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', probabilities: { '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 1 }, confidence: 1 } },
          usage: { input_tokens: 500, output_tokens: 30, cost: 0.00002 },
        }),
        text: async () => '{}',
      };
    }));
    const res = mockRes();
    await handlers['POST /api/hub/jev/decide']({ headers: {}, body: body(), query: {} }, res);
    expect(seenUrl).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(seenBody.model).toBe('~typesafe/jev-latest');
    expect(seenBody.questions.recipient.type).toBe('choice');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.choice).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(res.body.confidence).toBe(1);
    expect(res.body.model).toBe('typesafe/jev-1.13-20260917');
  });

  it('502s when the model picks nothing usable', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ model: 'm', answers: { recipient: { type: 'choice', choice: '0xzzz', probabilities: {}, confidence: 1 } } }),
      text: async () => '{}',
    })));
    const res = mockRes();
    await handlers['POST /api/hub/jev/decide']({ headers: {}, body: body(), query: {} }, res);
    expect(res.statusCode).toBe(502);
  });
});
