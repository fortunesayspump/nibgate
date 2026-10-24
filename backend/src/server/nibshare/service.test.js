import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  update: vi.fn(),
  findUnique: vi.fn(),
  putBlob: vi.fn(),
  deleteBlob: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock('@nibgate/internal/db.js', () => ({
  db: { nibShare: { update: state.update, findUnique: state.findUnique }, nibShareEvent: { create: state.createEvent } },
}));
vi.mock('@nibgate/sdk/server', async (importOriginal) => ({
  ...await importOriginal(),
  putBlob: state.putBlob,
  deleteBlob: state.deleteBlob,
  generateContentKey: () => Buffer.alloc(32),
  encryptBytes: () => ({}),
  packCipherBlob: () => Buffer.from('ciphertext'),
  wrapKey: () => 'wrapped-key',
  contentHashFor: () => 'content-hash',
}));

import { recordView, shareManifest, updateShare } from './service.js';

const owner = '0x1111111111111111111111111111111111111111';
const share = {
  id: 'share-id', ownerWallet: owner, storageRef: 'nibshare/share-id/body.bin',
  whitelist: [], publicAccess: true,
};

describe('Nibshare owner edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NIBGATE_SHARE_KEY_SECRET = 'synthetic-test-secret';
    state.update.mockImplementation(async ({ data }) => ({ ...share, ...data }));
    state.putBlob.mockResolvedValue({ storageRef: 'nibshare/share-id/body-new.bin', url: 'https://example.test/body-new.bin' });
    state.deleteBlob.mockResolvedValue(undefined);
  });

  it('updates a title and content type without touching the encrypted body', async () => {
    const result = await updateShare(share, { title: 'New title', contentType: 'article' }, owner);
    expect(result.title).toBe('New title');
    expect(state.update).toHaveBeenCalledWith({ where: { id: share.id }, data: expect.objectContaining({ title: 'New title', contentType: 'article' }) });
    expect(state.putBlob).not.toHaveBeenCalled();
    expect(state.deleteBlob).not.toHaveBeenCalled();
  });

  it('rejects an invalid content type as a client error', async () => {
    await expect(updateShare(share, { contentType: 'invalid' }, owner)).rejects.toMatchObject({ status: 400 });
    expect(state.update).not.toHaveBeenCalled();
  });

  it('keeps the old encrypted body when the database update fails', async () => {
    state.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(updateShare(share, { content: 'new body' }, owner)).rejects.toThrow('database unavailable');
    expect(state.putBlob).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringMatching(/^nibshare\/share-id\/body-[^/]+\.bin$/) }));
    expect(state.deleteBlob).toHaveBeenCalledWith({ storageRef: 'nibshare/share-id/body-new.bin' });
    expect(state.deleteBlob).not.toHaveBeenCalledWith({ storageRef: share.storageRef });
  });
});

describe('anonymous view dedupe cache', () => {
  it('keeps recent keys while evicting the oldest when distinct viewers exceed the cap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      state.update.mockResolvedValue({});
      state.createEvent.mockResolvedValue({});
      const cacheShare = { id: 'cache-limit-share' };
      for (let i = 0; i <= 5000; i++) {
        await recordView(cacheShare, null, { dedupeKey: `viewer-${i}` });
      }
      expect(await recordView(cacheShare, null, { dedupeKey: 'viewer-5000' })).toEqual({ deduped: true });
      expect(await recordView(cacheShare, null, { dedupeKey: 'viewer-0' })).toEqual({ deduped: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('network-scoped share discovery', () => {
  it('does not publish mainnet access links from the default/testnet stack', async () => {
    const previousNetwork = process.env.NIBGATE_NETWORK;
    const previousApi = process.env.NIBGATE_PUBLIC_API_URL;
    const previousPublicApi = process.env.PUBLIC_API_URL;
    try {
      delete process.env.NIBGATE_NETWORK;
      delete process.env.NIBGATE_PUBLIC_API_URL;
      delete process.env.PUBLIC_API_URL;
      state.findUnique.mockResolvedValue({
        ...share,
        slug: 'test-share',
        title: 'Test share',
        summary: '',
        contentType: 'article',
        price: '1',
        whitelistPrice: null,
        currency: 'USDC',
        expiresAt: null,
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        viewCount: 0,
        unlockCount: 0,
      });
      const manifest = await shareManifest('test-share');
      expect(manifest.urls.access).toBe('https://testnet-api.nibgate.xyz/ns/test-share');
      expect(manifest.urls.manifest).toBe('https://testnet-api.nibgate.xyz/nibshare/test-share/manifest');
    } finally {
      if (previousNetwork === undefined) delete process.env.NIBGATE_NETWORK;
      else process.env.NIBGATE_NETWORK = previousNetwork;
      if (previousApi === undefined) delete process.env.NIBGATE_PUBLIC_API_URL;
      else process.env.NIBGATE_PUBLIC_API_URL = previousApi;
      if (previousPublicApi === undefined) delete process.env.PUBLIC_API_URL;
      else process.env.PUBLIC_API_URL = previousPublicApi;
    }
  });
});
