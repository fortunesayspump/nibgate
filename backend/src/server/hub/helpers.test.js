import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  website: { update: vi.fn() },
}));

vi.mock('@nibgate/internal/db.js', () => ({ db: dbMock }));

import {
  peerHubApiBase,
  fetchPeerVerification,
  crossStackAdoptData,
  maybeAdoptPeerVerification,
  adoptCrossStackIfStale,
  CROSS_STACK_ADOPT_TTL_MS,
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
    expect(noPeer).toEqual(local);

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
});