import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  website: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  wallet: { findUnique: vi.fn() },
  publisherIdentity: { findFirst: vi.fn(), upsert: vi.fn() },
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
    dbMock.publisherIdentity.upsert.mockResolvedValue({});

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

  it('sync-from-peer rejects without secret and validates body', async () => {
    const denied = mockRes();
    await handlers['POST /api/hub/site/sync-from-peer']({ headers: {}, body: { all: true }, query: {} }, denied);
    expect(denied.statusCode).toBe(403);

    const bad = mockRes();
    await handlers['POST /api/hub/site/sync-from-peer']({ headers: { 'x-peer-secret': 'test-peer-secret' }, body: {}, query: {} }, bad);
    expect(bad.statusCode).toBe(400);
  });
});
