import { describe, it, expect, vi, afterEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  content: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  contentEvent: { create: vi.fn(), createMany: vi.fn() },
  website: { update: vi.fn() },
}));
vi.mock('@nibgate/internal/db.js', () => ({ db: dbMock }));
const { syncWebsiteManifest, upsertTrackedContent } = await import('./helpers.js');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('manifest sync partial failures', () => {
  it('re-homes a legacy row by external ID when the testnet host changes', async () => {
    const website = { id: '2e8756ec-19ac-4472-a571-c650e6ff3c2d', domain: 'workshop.testnet.nibgate.xyz' };
    const externalId = '327fc5ac-f8f7-4a5d-adf8-3c4f552c4d74';
    dbMock.content.findUnique.mockResolvedValue({ id: '11899cc7dc1821bf6afad32f1c651a90', deletedAt: new Date('2026-09-21') });
    dbMock.content.update = vi.fn(async ({ data }) => ({ id: '11899cc7dc1821bf6afad32f1c651a90', url: data.url }));
    dbMock.contentEvent.create.mockResolvedValue({});
    const result = await upsertTrackedContent(website, {
      event: 'content_registered',
      resource: { id: externalId, path: '/photos/workshop-gallery', url: 'https://workshop.testnet.nibgate.xyz/photos/workshop-gallery' },
    }, { allowRevive: true });
    expect(result.id).toBe('11899cc7dc1821bf6afad32f1c651a90');
    expect(dbMock.content.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { websiteId_externalId: { websiteId: website.id, externalId } },
    }));
    expect(dbMock.content.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: result.id },
      data: expect.objectContaining({ url: 'https://workshop.testnet.nibgate.xyz/photos/workshop-gallery', deletedAt: null }),
    }));
    expect(dbMock.content.upsert).not.toHaveBeenCalled();
    expect(dbMock.contentEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'revived' }) }));
  });

  it('keeps existing content and records a failed scan when one upsert fails', async () => {
    const website = { id: 'site-1', domain: 'example.com' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ content: [
      { id: 'good', path: '/good', title: 'Good' },
      { id: 'bad', path: '/bad', title: 'Bad' },
    ] }) })));
    dbMock.content.findUnique.mockResolvedValue(null);
    dbMock.content.upsert.mockResolvedValueOnce({ id: 'new-good', url: 'https://example.com/good' })
      .mockRejectedValueOnce(Object.assign(new Error('missing content row'), { code: 'P2025' }));
    dbMock.website.update.mockResolvedValue({});
    const result = await syncWebsiteManifest(website);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(dbMock.content.findMany).not.toHaveBeenCalled();
    expect(dbMock.content.updateMany).not.toHaveBeenCalled();
    expect(dbMock.website.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastScanStatus: 'failed' }),
    }));
  });
});
