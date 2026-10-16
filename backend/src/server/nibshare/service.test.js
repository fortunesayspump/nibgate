import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  update: vi.fn(),
  putBlob: vi.fn(),
  deleteBlob: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock('@nibgate/internal/db.js', () => ({
  db: { nibShare: { update: state.update }, nibShareEvent: { create: state.createEvent } },
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

import { recordView, updateShare } from './service.js';

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
