import { describe, it, expect, vi, afterEach } from 'vitest';
const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('@nibgate/internal/db.js', () => ({ db: { indexState: { findUnique: async () => null, upsert: async () => ({}) } } }));
vi.mock('./gsc-sitemap.js', () => ({ getAccessToken: async () => 'fixture', request: async () => ({}), fetchSiteList: async () => [], submitSitemapForDomain: mocks.submit, assertIndexingDomain: () => {} }));
import { runIndexSweep } from './gsc-index.js';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Google submission reporting', () => {
  it('counts only successful sitemap submissions and retains failures', async () => {
    vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', '{}'); vi.stubEnv('INDEXNOW_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<urlset></urlset>')));
    mocks.submit.mockRejectedValueOnce(Error('quota')).mockResolvedValueOnce({});
    const result = await runIndexSweep({ domains: ['a.nibgate.xyz', 'b.nibgate.xyz'] });
    expect(result.resubmitted).toBe(1);
    expect(result.errors).toEqual(['a.nibgate.xyz: sitemap submission failed: quota']);
  });
});
