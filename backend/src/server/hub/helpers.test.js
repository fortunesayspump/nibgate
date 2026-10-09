import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

const dbMock = vi.hoisted(() => ({
  website: { update: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  wallet: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  publisherIdentity: { upsert: vi.fn(), findUnique: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  session: { count: vi.fn() },
  content: { updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  unlockReceipt: { updateMany: vi.fn(), upsert: vi.fn() },
  contentRating: { updateMany: vi.fn() },
  metric: { updateMany: vi.fn() },
  contentEvent: { updateMany: vi.fn() },
  blogPost: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  tip: { findMany: vi.fn() },
  nibShare: { findMany: vi.fn() },
  nibShareReceipt: { findMany: vi.fn(), count: vi.fn() },
  nibShareEvent: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('@nibgate/internal/db.js', () => ({ db: dbMock }));

import {
  peerHubApiBase,
  fetchPeerVerification,
  crossStackAdoptData,
  maybeAdoptPeerVerification,
  adoptCrossStackIfStale,
  CROSS_STACK_ADOPT_TTL_MS,
  localCanonicalDomain,
  normalizeWalletAddress,
  mintBlogLinkToken,
  verifyBlogLinkToken,
  resolveUserByWallet,
  checkPeerSecret,
  mirrorPeerSite,
  fetchPeerIdentity,
  claimPeerSitesForWallet,
  siteIdentityFor,
  normalizeNetworkName,
  networkForReceiptLike,
  backfillNetworkColumns,
  contentDataFor,
  upsertUnlockReceipt,
  createMetric,
  mirrorPeerBlogPost,
  absoluteResourceUrl,
  tipRevenueByContentId,
  attributeTips,
  nibshareStatsByWallet,
  platformMoneyTotals,
  resolveTipContent,
} from './helpers.js';

describe('cross-stack verification sync', () => {
  const ORIGINAL_PEER = process.env.NIBGATE_PEER_HUB_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NIBGATE_PEER_HUB_URL = '';
  });
  afterEach(() => {
    process.env.NIBGATE_PEER_HUB_URL = ORIGINAL_PEER;
  });

  it('peerHubApiBase honors the env override and derives the sister host otherwise', () => {
    process.env.NIBGATE_PEER_HUB_URL = 'https://peer.test/';
    expect(peerHubApiBase()).toBe('https://peer.test');

    process.env.NIBGATE_PEER_HUB_URL = '';
    process.env.NIBGATE_NETWORK = 'mainnet';
    expect(peerHubApiBase()).toContain('testnet-api');
    process.env.NIBGATE_NETWORK = 'testnet';
    expect(peerHubApiBase()).toContain('api.nibgate.xyz');
  });

  it('fetchPeerVerification accepts a verified profile and ignores everything else', async () => {
    const ok = vi.fn(async () => ({ ok: true, json: async () => ({ verified: true, verificationStatus: 'verified', lastVerifiedAt: '2026-09-20T00:00:00Z' }) }));
    const peer = await fetchPeerVerification('example.com', { fetchFn: ok });
    expect(peer).toEqual({ verified: true, verificationStatus: 'verified', lastVerifiedAt: '2026-09-20T00:00:00Z', source: 'cross-stack' });

    const unverified = vi.fn(async () => ({ ok: true, json: async () => ({ verified: false, verificationStatus: 'pending' }) }));
    expect(await fetchPeerVerification('example.com', { fetchFn: unverified })).toBeNull();

    const failed = vi.fn(async () => ({ ok: false, status: 500 }));
    expect(await fetchPeerVerification('example.com', { fetchFn: failed })).toBeNull();

    const throwing = vi.fn(async () => { throw new Error('network down'); });
    expect(await fetchPeerVerification('example.com', { fetchFn: throwing })).toBeNull();

    expect(await fetchPeerVerification('', { fetchFn: ok })).toBeNull();
  });

  it('maybeAdoptPeerVerification upgrades a failed local check when the peer is verified', async () => {
    const local = { ok: false, status: 'missing_widget', reason: 'no widget', data: { isVerified: false, verificationStatus: 'missing_widget' } };
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ verified: true, verificationStatus: 'verified', lastVerifiedAt: '2026-09-20T00:00:00Z' }) }));
    const adopted = await maybeAdoptPeerVerification(local, { domain: 'example.com' }, { fetchFn: fetcher });
    expect(adopted.ok).toBe(true);
    expect(adopted.status).toBe('verified');
    expect(adopted.data.isVerified).toBe(true);
    expect(adopted.data.verificationStatus).toBe('verified');
    expect(adopted.data.verificationSource).toBe('cross-stack');

    const noPeer = await maybeAdoptPeerVerification(local, { domain: 'example.com' }, { fetchFn: async () => ({ ok: true, json: async () => ({ verified: false }) }) });
    expect(noPeer.ok).toBe(false);
    expect(noPeer.data.lastPeerCheckAt).toBeInstanceOf(Date);

    const fresh = await maybeAdoptPeerVerification(local, { domain: 'example.com', lastPeerCheckAt: new Date() }, { fetchFn: fetcher });
    expect(fresh).toEqual(local);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const alreadyOk = { ok: true, status: 'verified', reason: '', data: { isVerified: true } };
    const untouched = await maybeAdoptPeerVerification(alreadyOk, { domain: 'example.com' }, { fetchFn: fetcher });
    expect(untouched).toBe(alreadyOk);
  });

  it('adoptCrossStackIfStale persists adoption, respects TTL, and never throws', async () => {
    const site = { id: 'w1', domain: 'example.com', deletedAt: null, isVerified: false, verificationStatus: 'pending', lastPeerCheckAt: null };
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ verified: true, verificationStatus: 'verified', lastVerifiedAt: '2026-09-20T00:00:00Z' }) }));
    dbMock.website.update.mockResolvedValue({ ...site, isVerified: true, verificationStatus: 'verified' });

    const adopted = await adoptCrossStackIfStale(site, { fetchFn: fetcher });
    expect(adopted.isVerified).toBe(true);
    expect(dbMock.website.update).toHaveBeenCalledTimes(1);
    expect(dbMock.website.update.mock.calls[0][0].data.verificationSource).toBe('cross-stack');

    dbMock.website.update.mockClear();
    const already = await adoptCrossStackIfStale({ ...site, isVerified: true, verificationStatus: 'verified' }, { fetchFn: fetcher });
    expect(already.isVerified).toBe(true);
    expect(dbMock.website.update).not.toHaveBeenCalled();

    dbMock.website.update.mockClear();
    const recent = await adoptCrossStackIfStale({ ...site, lastPeerCheckAt: new Date() }, { fetchFn: fetcher });
    expect(recent.verificationStatus).toBe('pending');
    expect(dbMock.website.update).not.toHaveBeenCalled();

    dbMock.website.update.mockClear();
    dbMock.website.update.mockRejectedValueOnce(new Error('db down'));
    await expect(adoptCrossStackIfStale(site, { fetchFn: fetcher })).resolves.toBe(site);
  });

  it('crossStackAdoptData merges local data with peer provenance', () => {
    const data = crossStackAdoptData({ lastVerificationCheckAt: new Date(0) }, { lastVerifiedAt: '2026-09-20T00:00:00Z' });
    expect(data.isVerified).toBe(true);
    expect(data.verificationStatus).toBe('verified');
    expect(data.verificationFailureReason).toBeNull();
    expect(data.verificationSource).toBe('cross-stack');
    expect(data.lastVerifiedAt).toBeInstanceOf(Date);
    expect(data.lastPeerCheckAt).toBeInstanceOf(Date);
  });

  it('CROSS_STACK_ADOPT_TTL_MS is one hour', () => {
    expect(CROSS_STACK_ADOPT_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('localCanonicalDomain translates only hosted apex forms per network', () => {
    process.env.NIBGATE_NETWORK = 'mainnet';
    expect(localCanonicalDomain('smalltalk.testnet.nibgate.xyz')).toBe('smalltalk.nibgate.xyz');
    expect(localCanonicalDomain('testnet-smalltalk.nibgate.xyz')).toBe('smalltalk.nibgate.xyz');
    expect(localCanonicalDomain('smalltalk.nibgate.xyz')).toBe('smalltalk.nibgate.xyz');
    expect(localCanonicalDomain('custom.com')).toBe('custom.com');

    process.env.NIBGATE_NETWORK = 'testnet';
    expect(localCanonicalDomain('smalltalk.nibgate.xyz')).toBe('smalltalk.testnet.nibgate.xyz');
    expect(localCanonicalDomain('smalltalk.testnet.nibgate.xyz')).toBe('smalltalk.testnet.nibgate.xyz');
    expect(localCanonicalDomain('custom.com')).toBe('custom.com');
    expect(localCanonicalDomain('www.nibgate.xyz')).toBe('nibgate.xyz');
    expect(localCanonicalDomain('api.nibgate.xyz')).toBe('api.nibgate.xyz');
    expect(localCanonicalDomain('nibgate.xyz')).toBe('nibgate.xyz');
  });

  it('blog link tokens round-trip, reject tampering, and accept the legacy secret', () => {
    process.env.BLOG_LINK_SECRET = 'shared-secret';
    process.env.JWT_SECRET = 'legacy-secret';
    const token = mintBlogLinkToken({ userId: 'u1', wallet: '0x0000000000000000000000000000000000000001' });
    const payload = verifyBlogLinkToken(token);
    expect(payload.userId).toBe('u1');
    expect(payload.wallet).toBe('0x0000000000000000000000000000000000000001');

    expect(verifyBlogLinkToken(token.slice(0, -2) + 'ff')).toBeNull();
    expect(verifyBlogLinkToken('bad.format')).toBeNull();

    const cryptoLib = crypto;
    const legacyPayload = JSON.stringify({ userId: 'u9', wallet: null, code: 'c', expiresAt: Date.now() + 60000 });
    const legacySig = cryptoLib.createHmac('sha256', 'legacy-secret').update(legacyPayload).digest('hex');
    expect(verifyBlogLinkToken(`c.${Buffer.from(legacyPayload).toString('base64url')}.${legacySig}`).userId).toBe('u9');

    const expiredPayload = JSON.stringify({ userId: 'u9', wallet: null, code: 'c', expiresAt: Date.now() - 1000 });
    const expiredSig = cryptoLib.createHmac('sha256', 'shared-secret').update(expiredPayload).digest('hex');
    expect(verifyBlogLinkToken(`c.${Buffer.from(expiredPayload).toString('base64url')}.${expiredSig}`)).toBeNull();
    process.env.BLOG_LINK_SECRET = '';
  });

  it('resolveUserByWallet links by wallet row, user field, or creates a stub', async () => {
    const a1 = '0x00000000000000000000000000000000000000aa';
    dbMock.wallet.findUnique.mockResolvedValue({ address: a1, user: { id: 'u1' } });
    expect((await resolveUserByWallet(a1.toUpperCase())).id).toBe('u1');

    dbMock.wallet.findUnique.mockResolvedValue(null);
    dbMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    expect((await resolveUserByWallet(a1)).id).toBe('u2');

    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({ id: 'u3' });
    expect((await resolveUserByWallet('0x0000000000000000000000000000000000000009')).id).toBe('u3');
    expect(dbMock.user.create.mock.calls[0][0].data.walletAddress).toBe('0x0000000000000000000000000000000000000009');

    expect(await resolveUserByWallet('not-an-address')).toBeNull();
  });

  it('mirrorPeerSite provisions identity only, never without owner or verification', async () => {
    process.env.NIBGATE_NETWORK = 'mainnet';
    dbMock.website.findFirst.mockResolvedValue(null);
    dbMock.wallet.findUnique.mockResolvedValue(null);
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({ id: 'owner1' });
    dbMock.website.create.mockResolvedValue({ id: 'w9', domain: 'smalltalk.nibgate.xyz' });
    dbMock.publisherIdentity.findUnique.mockResolvedValue(null);
    dbMock.publisherIdentity.create.mockResolvedValue({});

    const row = await mirrorPeerSite({
      domain: 'smalltalk.testnet.nibgate.xyz', name: 'Smalltalk', verificationStatus: 'verified',
      ownerWallets: ['0x0000000000000000000000000000000000000007'],
      publisher: { externalId: 'ext1', handle: 'smalltalk' },
    });
    expect(row.id).toBe('w9');
    expect(dbMock.website.create.mock.calls[0][0].data.domain).toBe('smalltalk.nibgate.xyz');
    expect(dbMock.website.create.mock.calls[0][0].data.verificationSource).toBe('cross-stack');
    expect(dbMock.website.create.mock.calls[0][0].data).not.toHaveProperty('content');

    dbMock.website.create.mockClear();
    expect(await mirrorPeerSite({ domain: 'x.test', verificationStatus: 'pending', ownerWallets: ['0x0000000000000000000000000000000000000007'] })).toBeNull();
    expect(await mirrorPeerSite({ domain: 'x.test', verificationStatus: 'verified', ownerWallets: [] })).toBeNull();
    expect(await mirrorPeerSite({ domain: 'not a domain!!!', verificationStatus: 'verified', ownerWallets: ['0x0000000000000000000000000000000000000007'] })).toBeNull();
    expect(dbMock.website.create).not.toHaveBeenCalled();
  });

  it('checkPeerSecret gates on the shared secret only', () => {
    process.env.BLOG_LINK_SECRET = 'shared-secret';
    process.env.JWT_SECRET = 'legacy-secret';
    expect(checkPeerSecret({ headers: { 'x-peer-secret': 'shared-secret' }, body: {}, query: {} })).toBe(true);
    expect(checkPeerSecret({ headers: { 'x-peer-secret': 'legacy-secret' }, body: {}, query: {} })).toBe(false);
    expect(checkPeerSecret({ headers: {}, body: {}, query: {} })).toBe(false);
    process.env.BLOG_LINK_SECRET = '';
    expect(checkPeerSecret({ headers: { 'x-peer-secret': 'x' }, body: {}, query: {} })).toBe(false);
  });

  it('fetchPeerIdentity returns full identity only when verified', async () => {
    const ok = vi.fn(async () => ({ ok: true, json: async () => ({ verified: true, verificationStatus: 'verified', domain: 'd.com', name: 'D', ownerWallets: ['0x1'], publisher: { handle: 'd' } }) }));
    expect(await fetchPeerIdentity('d.com', { fetchFn: ok })).toEqual({ domain: 'd.com', name: 'D', verificationStatus: 'verified', lastVerifiedAt: null, ownerWallets: ['0x1'], publisher: { handle: 'd' }, siteMeta: null, ownerProfile: null });
    const no = vi.fn(async () => ({ ok: true, json: async () => ({ verified: false }) }));
    expect(await fetchPeerIdentity('d.com', { fetchFn: no })).toBeNull();
  });

  it('claimPeerSitesForWallet mirrors only the signer wallet sites', async () => {    process.env.NIBGATE_NETWORK = 'mainnet';
    process.env.BLOG_LINK_SECRET = 's';
    const mine = '0x00000000000000000000000000000000000000aa';
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sites: [
        { domain: 'mine.testnet.nibgate.xyz', name: 'Mine', verificationStatus: 'verified', ownerWallets: [mine], publisher: null },
        { domain: 'theirs.testnet.nibgate.xyz', name: 'Theirs', verificationStatus: 'verified', ownerWallets: ['0x00000000000000000000000000000000000000bb'], publisher: null },
      ] }),
    }));
    dbMock.website.findFirst.mockResolvedValue(null);
    dbMock.wallet.findUnique.mockResolvedValue(null);
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({ id: 'owner1' });
    dbMock.website.create.mockImplementation(async ({ data }) => ({ id: 'w', domain: data.domain }));
    dbMock.publisherIdentity.upsert.mockResolvedValue({});

    const claimed = await claimPeerSitesForWallet(mine, { fetchFn: fetcher });
    expect(claimed).toEqual(['mine.nibgate.xyz']);
    expect(dbMock.website.create.mock.calls[0][0].data.domain).toBe('mine.nibgate.xyz');

    process.env.BLOG_LINK_SECRET = '';
    expect(await claimPeerSitesForWallet(mine, { fetchFn: fetcher })).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never adopts cross-stack status for hosted nibgate-apex (subblog) domains', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ verified: true, verificationStatus: 'verified' }) }));
    const subblogRow = { id: 'w2', domain: 'mylog.nibgate.xyz', deletedAt: null, isVerified: false, verificationStatus: 'pending', lastPeerCheckAt: null };
    const adopted = await adoptCrossStackIfStale(subblogRow, { fetchFn: fetcher });
    expect(adopted.verificationStatus).toBe('pending');
    expect(dbMock.website.update).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();

    const local = { ok: false, status: 'missing_widget', reason: '', data: { isVerified: false } };
    const upgraded = await maybeAdoptPeerVerification(local, { domain: 'mylog.nibgate.xyz' }, { fetchFn: fetcher });
    expect(upgraded).toEqual(local);

    dbMock.website.update.mockClear();
    const customSite = { id: 'w3', domain: 'custom.com', deletedAt: null, isVerified: false, verificationStatus: 'pending', lastPeerCheckAt: null };
    await adoptCrossStackIfStale(customSite, { fetchFn: fetcher });
    expect(dbMock.website.update).toHaveBeenCalledTimes(1);
  });

  it('stamps the hub network on content, receipts, ratings, and metrics', async () => {
    process.env.NIBGATE_NETWORK = 'testnet';
    const website = { id: 'w1', domain: 'custom.com' };
    const data = contentDataFor(website, { resource: { id: 'r1', title: 'T' } });
    expect(data.network).toBe('testnet');

    dbMock.unlockReceipt.upsert.mockResolvedValue({ id: 'r1' });
    const content = { id: 'c1', recipientWallet: null, currency: 'USDC' };
    await upsertUnlockReceipt(website, content, { amount: '1', chainId: 5042002 }, 'payment_completed', { serverVerified: true });
    expect(dbMock.unlockReceipt.upsert.mock.calls[0][0].create.network).toBe('testnet');

    dbMock.metric.create = vi.fn().mockResolvedValue({ id: 'm1' });
    await createMetric(website, content, {}, 'page_view', 'view');
    expect(dbMock.metric.create.mock.calls[0][0].data.network).toBe('testnet');
  });

  it('rejects receipts whose chain attests the other stack', async () => {
    process.env.NIBGATE_NETWORK = 'testnet';
    dbMock.unlockReceipt.upsert.mockClear();
    const website = { id: 'w1', domain: 'custom.com' };
    const content = { id: 'c1', recipientWallet: null, currency: 'USDC' };
    const skipped = await upsertUnlockReceipt(website, content, { amount: '1', chainId: 5042 }, 'payment_completed', { serverVerified: true });
    expect(skipped).toBeNull();
    expect(dbMock.unlockReceipt.upsert).not.toHaveBeenCalled();
    expect(networkForReceiptLike({ chainId: 5042002 })).toBe('testnet');
    expect(normalizeNetworkName('eip155:5042')).toBe('mainnet');
  });

  it('backfills null networks idempotently per model', async () => {
    process.env.NIBGATE_NETWORK = 'mainnet';
    dbMock.content.updateMany.mockResolvedValue({ count: 3 });
    dbMock.unlockReceipt.updateMany.mockResolvedValue({ count: 0 });
    dbMock.contentRating.updateMany.mockResolvedValue({ count: 1 });
    dbMock.metric.updateMany.mockResolvedValue({ count: 9 });
    dbMock.contentEvent.updateMany.mockResolvedValue({ count: 2 });
    const counts = await backfillNetworkColumns();
    expect(counts).toEqual({ content: 3, unlockReceipt: 0, contentRating: 1, metric: 9, contentEvent: 2 });
    expect(dbMock.content.updateMany.mock.calls[0][0]).toEqual({ where: { network: null }, data: { network: 'mainnet' } });
  });

  it('siteIdentityFor carries site meta and owner profile', async () => {
    dbMock.user.findUnique.mockResolvedValue({
      id: 'u1', walletAddress: '0x0000000000000000000000000000000000000001',
      username: 'creator', bio: 'writes things', avatarUrl: 'https://img/x.png',
      wallets: [{ address: '0x0000000000000000000000000000000000000001' }],
    });
    dbMock.publisherIdentity.findFirst.mockResolvedValue({ externalId: 'e1', handle: 'h', name: 'N', walletAddress: null });
    const identity = await siteIdentityFor({ id: 'w1', ownerId: 'u1', name: 'S', description: 'D', faviconUrl: 'F', ogImageUrl: null });
    expect(identity.ownerWallets).toEqual(['0x0000000000000000000000000000000000000001']);
    expect(identity.ownerProfile.username).toBe('creator');
    expect(identity.ownerProfile.avatarUrl).toBe('https://img/x.png');
    expect(identity.siteMeta).toEqual({ name: 'S', description: 'D', faviconUrl: 'F', ogImageUrl: null });
    expect(identity.publisher.handle).toBe('h');
  });

  it('mirror refreshes metadata fill-forward without stomping local edits', async () => {    process.env.NIBGATE_NETWORK = 'mainnet';
    const identity = {
      domain: 'smalltalk.testnet.nibgate.xyz', name: 'Smalltalk', verificationStatus: 'verified',
      ownerWallets: ['0x0000000000000000000000000000000000000007'],
      publisher: { externalId: 'ext1', handle: 'smalltalk' },
      siteMeta: { name: 'Smalltalk', description: 'Peer desc', faviconUrl: 'https://peer/f.png', ogImageUrl: null },
      ownerProfile: { walletAddress: '0x0000000000000000000000000000000000000007', username: 'peername', bio: 'Peer bio' },
    };
    dbMock.website.findFirst.mockResolvedValue({ id: 'w9', domain: 'smalltalk.nibgate.xyz', ownerId: 'owner1', description: 'Local desc', faviconUrl: null });
    dbMock.website.update.mockResolvedValue({ id: 'w9' });
    dbMock.session.count.mockResolvedValue(2);
    dbMock.publisherIdentity.findUnique.mockResolvedValue(null);
    dbMock.publisherIdentity.create.mockResolvedValue({});

    const row = await mirrorPeerSite(identity);
    expect(row.id).toBe('w9');
    const updateData = dbMock.website.update.mock.calls[0][0].data;
    expect(updateData.description).toBeUndefined();
    expect(updateData.faviconUrl).toBe('https://peer/f.png');
    expect(dbMock.user.update).not.toHaveBeenCalled();
  });

  it('mirrorPeerBlogPost mirrors published posts, never drafts, newer-local-wins', async () => {
    const authorWallet = '0x00000000000000000000000000000000000000aa';
    dbMock.wallet.findUnique.mockResolvedValue(null);
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({ id: 'author1' });
    dbMock.blogPost.findUnique.mockResolvedValue(null);
    dbMock.blogPost.create.mockResolvedValue({ id: 'p1', slug: 'hello' });

    const row = await mirrorPeerBlogPost({
      slug: 'hello', title: 'Hello', bodyMarkdown: 'Body text here, long enough.',
      excerpt: 'Hi', tag: 'Company', tags: ['a'], coverUrl: '', status: 'published',
      publishedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
      author: { walletAddress: authorWallet },
    });
    expect(row.slug).toBe('hello');
    expect(dbMock.blogPost.create.mock.calls[0][0].data.authorId).toBe('author1');
    expect(dbMock.blogPost.create.mock.calls[0][0].data.status).toBe('published');

    expect(await mirrorPeerBlogPost({ slug: 'd', title: 'D', bodyMarkdown: 'Body text here, long enough.', status: 'draft', author: { walletAddress: authorWallet } })).toBeNull();
    expect(await mirrorPeerBlogPost({ slug: 'e', title: 'E', bodyMarkdown: 'Body text here, long enough.', status: 'published', author: {} })).toBeNull();

    dbMock.blogPost.findUnique.mockResolvedValue({ id: 'p1', slug: 'hello', updatedAt: new Date('2026-10-01T00:00:00Z') });
    dbMock.blogPost.update.mockClear();
    const kept = await mirrorPeerBlogPost({
      slug: 'hello', title: 'Hello v2', bodyMarkdown: 'Body text here, long enough.', status: 'published',
      updatedAt: '2026-09-01T00:00:00Z', author: { walletAddress: authorWallet },
    });
    expect(kept.id).toBe('p1');
    expect(dbMock.blogPost.update).not.toHaveBeenCalled();
  });
});

describe('absoluteResourceUrl canonicalization', () => {
  const site = { domain: 'thedeepend.testnet.nibgate.xyz' };

  it('collapses the subblogs API host onto the site origin', () => {
    expect(absoluteResourceUrl(site, { url: 'https://api-subblogs.nibgate.xyz/writing/thedeepend-best-beaches' }))
      .toBe('https://thedeepend.testnet.nibgate.xyz/writing/thedeepend-best-beaches');
  });

  it('collapses testnet/mainnet aliases of the same site', () => {
    expect(absoluteResourceUrl(site, { url: 'https://thedeepend.nibgate.xyz/writing/x/' }))
      .toBe('https://thedeepend.testnet.nibgate.xyz/writing/x');
  });

  it('leaves a different creator host untouched', () => {
    expect(absoluteResourceUrl(site, { url: 'https://otherblog.nibgate.xyz/writing/y' }))
      .toBe('https://otherblog.nibgate.xyz/writing/y');
  });

  it('resolves a relative path against the site origin', () => {
    expect(absoluteResourceUrl(site, { path: '/writing/z' }))
      .toBe('https://thedeepend.testnet.nibgate.xyz/writing/z');
  });
});

describe('tip + nibshare money attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tipRevenueByContentId nets refunds and ignores held tips', async () => {
    dbMock.tip.findMany.mockResolvedValue([
      { contentId: 'c1', amount: 1 },
      { contentId: 'c1', amount: 0.5 },
      { contentId: 'c1', amount: -1, status: 'refunded' },
      { contentId: 'c2', amount: 2 },
    ]);
    const map = await tipRevenueByContentId(['c1', 'c2']);
    expect(map.get('c1')).toBeCloseTo(0.5);
    expect(map.get('c2')).toBe(2);
    // held tips never reach the query: only money statuses are requested
    expect(dbMock.tip.findMany.mock.calls[0][0].where.status).toEqual({ in: ['settled', 'released', 'refunded'] });
  });

  it('attributeTips counts each tip once with contentId > websiteId > domain priority', async () => {
    dbMock.tip.findMany.mockResolvedValue([
      { contentId: 'c1', websiteId: 's9', domain: 'other.xyz', contentUrl: '', amount: 1 },
      { contentId: null, websiteId: 's1', domain: null, contentUrl: '', amount: 2 },
      { contentId: null, websiteId: null, domain: 'alpha.nibgate.xyz', contentUrl: '', amount: 4 },
      { contentId: null, websiteId: null, domain: null, contentUrl: 'https://alpha.nibgate.xyz/post', amount: 8 },
      { contentId: null, websiteId: null, domain: null, contentUrl: 'https://unknown.xyz/x', amount: 16 },
    ]);
    const out = await attributeTips({
      contentToSite: new Map([['c1', 's1']]),
      siteToOwner: new Map([['s1', 'u1']]),
      domainToSite: new Map([['alpha.nibgate.xyz', 's1']]),
    });
    expect(out.byContent.get('c1')).toBe(1);
    // s1: 1 (via content) + 2 (websiteId) + 4 (domain) + 8 (url host) = 15, unknown skipped
    expect(out.bySite.get('s1')).toBe(15);
    expect(out.byOwner.get('u1')).toBe(15);
    expect(out.bySite.has('s9')).toBe(false);
  });

  it('nibshareStatsByWallet matches wallets case-insensitively and counts paid only', async () => {
    dbMock.nibShare.findMany.mockResolvedValue([
      { id: 'sh1', ownerWallet: '0xABC' },
    ]);
    dbMock.nibShareReceipt.findMany.mockResolvedValue([
      { shareId: 'sh1', amount: 1.5 },
      { shareId: 'sh1', amount: 0 },
    ]);
    dbMock.nibShareEvent.findMany.mockResolvedValue([
      { shareId: 'sh1' }, { shareId: 'sh1' },
    ]);
    const map = await nibshareStatsByWallet(['0xabc']);
    expect(map.get('0xabc')).toEqual({ revenue: 1.5, unlocks: 1, views: 2 });
  });

  it('resolveTipContent resolves hub ids, site external ids, absolute URLs, and relative paths', async () => {
    const row = { id: 'hub-content-1', externalId: 'post-uuid', websiteId: 'w1', url: 'https://medblog.nibgate.xyz/writing/bp', path: '/writing/bp', imageUrl: 'https://img/c.png', website: { id: 'w1', domain: 'medblog.nibgate.xyz' } };
    dbMock.content.findFirst.mockResolvedValue(row);

    expect(await resolveTipContent({ contentId: 'post-uuid' })).toBe(row);
    expect(dbMock.content.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ id: 'post-uuid' }, { externalId: 'post-uuid' }] } }));

    vi.clearAllMocks();
    dbMock.content.findMany.mockResolvedValue([row]);
    expect(await resolveTipContent({ contentUrl: '/writing/bp' })).toBe(row);
    expect(dbMock.content.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { path: '/writing/bp', deletedAt: null }, take: 2 }));

    // A shared path (2 owners) must not mis-attribute.
    dbMock.content.findMany.mockResolvedValue([row, { ...row, id: 'other' }]);
    expect(await resolveTipContent({ contentUrl: '/writing/bp' })).toBeNull();

    vi.clearAllMocks();
    dbMock.content.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row);
    expect(await resolveTipContent({ contentUrl: 'https://medblog.nibgate.xyz/writing/bp', websiteId: 'w1' })).toBe(row);
    const calls = dbMock.content.findFirst.mock.calls.map((c) => c[0].where);
    expect(calls[0]).toEqual({ websiteId: 'w1', path: '/writing/bp', deletedAt: null });
    expect(calls[1]).toEqual({ url: 'https://medblog.nibgate.xyz/writing/bp', deletedAt: null });
  });

  it('resolveTipContent returns null when there is nothing to resolve', async () => {
    dbMock.content.findFirst.mockResolvedValue(null);
    dbMock.content.findMany.mockResolvedValue([]);
    expect(await resolveTipContent({})).toBeNull();
    expect(await resolveTipContent({ contentUrl: '/nope' })).toBeNull();
  });

  it('platformMoneyTotals nets tips and sums nibshare revenue', async () => {
    dbMock.tip.findMany.mockResolvedValue([
      { amount: 1, status: 'settled', protocolFee: 0.01 },
      { amount: -1, status: 'refunded', protocolFee: 0 },
    ]);
    dbMock.nibShareReceipt.findMany.mockResolvedValue([{ amount: 2, protocolFee: 0.02 }]);
    dbMock.nibShareEvent.count.mockResolvedValue(7);
    dbMock.nibShareReceipt.count.mockResolvedValue(3);
    const t = await platformMoneyTotals();
    expect(t.tipRevenue).toBe(0);
    expect(t.tips).toBe(1);
    expect(t.tipFees).toBeCloseTo(0.01);
    expect(t.nibshareRevenue).toBe(2);
    expect(t.nibshareUnlocks).toBe(3);
    expect(t.nibshareViews).toBe(7);
  });
});