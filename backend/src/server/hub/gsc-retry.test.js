import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ row: null, submit: vi.fn(), update: vi.fn(), read: vi.fn() }));
vi.mock('@nibgate/internal/db.js', () => ({ db: { indexState: {
  findUnique: (...args) => m.read(...args),
  upsert: async ({ create, update }) => (m.row = m.row ? { ...m.row, ...update } : create),
  update: (...args) => m.update(...args),
} } }));
vi.mock('./gsc-sitemap.js', () => ({ getAccessToken: async () => 'fixture', request: async () => ({}), fetchSiteList: async () => [], submitSitemapForDomain: (...args) => m.submit(...args), assertIndexingDomain: () => {} }));
import { runIndexSweep, submitIndexNow } from './gsc-index.js';
const domain = 'fixture.nibgate.xyz';
const xml = `<urlset><url><loc>https://${domain}/</loc></url></urlset>`;
const run = () => runIndexSweep({ domains: [domain] });
beforeEach(() => {
  vi.resetAllMocks(); m.row = null;
  m.read.mockImplementation(async () => m.row);
  m.update.mockImplementation(async ({ data }) => (m.row = { ...m.row, ...data }));
  m.submit.mockResolvedValue({});
  vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', '{}'); vi.stubEnv('INDEXNOW_KEY', '');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(xml)));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('retries unchanged sitemap after Google failure and stops resubmitting after acceptance', async () => {
  m.submit.mockRejectedValueOnce(Error('fixture failure'));
  expect((await run()).errors).toHaveLength(1); expect(m.row.sitemapHash).toBeNull();
  expect((await run()).resubmitted).toBe(1); expect(m.row.sitemapHash).toBeTruthy();
  expect((await run()).resubmitted).toBe(0); expect(m.submit).toHaveBeenCalledTimes(2);
});
it('retains the old accepted hash when changed content fails delivery', async () => {
  m.row = { sitemapHash: 'previous' }; m.submit.mockRejectedValueOnce(Error('fixture failure'));
  await run(); expect(m.row.sitemapHash).toBe('previous');
  await run(); expect(m.row.sitemapHash).not.toBe('previous');
});
it('retries after IndexNow failure and records 202 as accepted but pending', async () => {
  vi.stubEnv('INDEXNOW_KEY', 'fixture-key'); let calls = 0;
  fetch.mockImplementation(async url => url.includes('api.indexnow.org')
    ? new Response('', { status: ++calls === 1 ? 429 : 202 }) : new Response(xml));
  expect((await run()).indexNowErrors).toBe(1); expect(m.row.sitemapHash).toBeNull();
  const result = await run(); expect(result.indexNowErrors).toBe(0); expect(result.indexNowPending).toBe(1);
  expect(m.row.sitemapHash).toBeTruthy(); await run(); expect(calls).toBe(2);
});
it('does not submit or checkpoint on sitemap fetch failure', async () => {
  fetch.mockResolvedValue(new Response('', { status: 503 }));
  expect((await run()).errors).toHaveLength(1); expect(m.submit).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it('retries delivery after checkpoint write fails', async () => {
  m.update.mockRejectedValueOnce(Error('database unavailable'));
  expect((await run()).errors).toHaveLength(1); expect(m.row.sitemapHash).toBeNull();
  await run(); expect(m.submit).toHaveBeenCalledTimes(2); expect(m.row.sitemapHash).toBeTruthy();
});
it('does not treat a failed database read as a new site', async () => {
  m.read.mockRejectedValueOnce(Error('database unavailable'));
  expect((await run()).errors).toHaveLength(1); expect(m.submit).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('does not write or submit in dry-run or nonpersisting modes', async () => {
  await runIndexSweep({ domains: [domain], dryRun: true });
  await runIndexSweep({ domains: [domain], persist: false });
  expect(m.row).toBeNull(); expect(m.submit).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it.each([200, 202])('uses a hostname and HTTPS key location for IndexNow %s', async status => {
  vi.stubEnv('INDEXNOW_KEY', 'fixture-key'); fetch.mockResolvedValue(new Response('', { status }));
  const result = await submitIndexNow(domain, [`https://${domain}/`]);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ host: domain, key: 'fixture-key', keyLocation: `https://${domain}/fixture-key.txt`, urlList: [`https://${domain}/`] });
  expect(result).toEqual({ ok: true, pending: status === 202, urls: 1 });
});
it('reports only the number of URLs actually submitted', async () => {
  vi.stubEnv('INDEXNOW_KEY', 'fixture-key'); fetch.mockResolvedValue(new Response('', { status: 200 }));
  expect((await submitIndexNow(domain, Array(10001).fill(`https://${domain}/`))).urls).toBe(10000);
});
