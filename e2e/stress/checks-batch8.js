// Batch 8 — PLATFORM-API surface checks. These endpoints have NO dedicated
// frontend (manifest, status, entropy, ledger-of-record, revoke/reslug/ban/
// access-policy controls), so they are exercised at the API layer. Every
// feature that HAS a UI is covered frontend-first in the other batches.
const h = require('./runner.js').h;
const FX = require('./fixtures.json');
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

async function sellerAuthed(page) {
  await h.gotoSafe(page, 'https://nibgate.xyz/share');
  const { connectSellerFlow } = require('../harness/prod-lib.js');
  for (let i = 0; i < 3; i++) {
    await connectSellerFlow(page, { label: 's', log: () => {} });
    await page.waitForTimeout(1200);
    if ((await page.locator('input[placeholder="Post title"]').count()) > 0) return true;
    await page.reload({ waitUntil: 'commit' }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  return false;
}

const checks = [
  { id: 'px-01-nibgate-status', name: 'api-only: GET /api/nibgate/status shape (leaks localhost — finding #20)', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get('https://api.nibgate.xyz/api/nibgate/status');
      const t = await r.text();
      return [[r.status() === 200, `nibgate/status -> ${r.status()}`], [true, `body: ${t.slice(0, 140)}`]];
    } },
  { id: 'px-02-manifest', name: 'api-only: share manifest endpoint 200 with shape', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/manifest`);
      const j = await r.json().catch(() => ({}));
      return [[r.status() === 200, `manifest 200: ${r.status() === 200}`], [!!j.slug && j.kind === 'nibshare', `manifest shape: kind=${j.kind} slug=${j.slug}`]];
    } },
  { id: 'px-03-record-view', name: 'api-only: POST /view records a view (200)', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.post(`https://api.nibgate.xyz/api/nibshare/${FX.free.slug}/view`);
      return [[r.status() === 200, `recordView -> ${r.status()}`]];
    } },
  { id: 'px-04-quote-free', name: 'api-only: quote on free post → canUnlock true', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get(`https://api.nibgate.xyz/api/nibshare/${FX.free.slug}/quote?wallet=0x1111111111111111111111111111111111111111`);
      const j = await r.json().catch(() => ({}));
      return [[r.status() === 200 && j.canUnlock === true, `free canUnlock=true: ${j.canUnlock}`]];
    } },
  { id: 'px-05-ban-roundtrip', name: 'api-only: ban + restore a throwaway wallet on paid fixture', group: 'platform-api', run: async (h, { page, context }) => {
      await sellerAuthed(page);
      const W = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const api = context.request;
      let r = await api.post(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/entitlements/${W}/ban`, { data: {} });
      const expects = [[r.status() === 200, `ban -> ${r.status()}`]];
      r = await api.get(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/quote?wallet=${W}`);
      const q = await r.json().catch(() => ({}));
      expects.push([q.banned === true, `banned reflected: ${q.banned}`]);
      r = await api.delete(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/entitlements/${W}`);
      expects.push([r.status() === 200, `restore -> ${r.status()}`]);
      r = await api.get(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/quote?wallet=${W}`);
      const q2 = await r.json().catch(() => ({}));
      expects.push([q2.banned !== true, `unbanned: ${q2.banned}`]);
      return expects;
    } },
  { id: 'px-06-hub-stats', name: 'api-only: hub stats positive', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get('https://api.nibgate.xyz/api/hub/stats');
      const s = ((await r.json().catch(() => ({}))).stats || {});
      return [[r.status() === 200 && s.creators > 0 && s.content > 0, `creators=${s.creators} content=${s.content} sites=${s.sites}`]];
    } },
  { id: 'px-07-access-402', name: 'api-only: unbought paid access is 402 + empty (no leak)', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/access?wallet=0x1111111111111111111111111111111111111111`);
      const t = await r.text();
      return [[r.status() === 402, `access -> ${r.status()}`], [t.length < 60, `no body: "${t}"`]];
    } },
  { id: 'px-08-owned-access', name: 'api-only: owner wallet /access on own paid post → 402 (no owner gratis — finding)', group: 'platform-api', run: async (h, { page, context }) => {
      await sellerAuthed(page);
      const { makeWallet } = require('../harness/prod-lib.js');
      const { account } = await makeWallet(h.SEL_PK);
      const r = await context.request.get(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/access?wallet=${account.address}`);
      return [[r.status() === 402, `owner access -> ${r.status()}`]];
    } },
  { id: 'px-09-reslug', name: 'api-only: slug rotation (old 404s, new serves)', group: 'platform-api', run: async (h, { page, context }) => {
      await sellerAuthed(page);
      const api = context.request;
      const c = await api.post('https://api.nibgate.xyz/api/nibshare', { data: { title: 'E2E API Reslug Tmp', content: 'x', price: '0', status: 'active', publicAccess: true, contentType: 'article' } });
      const slug = (await c.json().catch(() => ({}))).slug;
      const expects = [[!!slug, `created: ${slug}`]];
      if (slug) {
        const r = await api.post(`https://api.nibgate.xyz/api/nibshare/${slug}/reslug`);
        const j2 = await r.json().catch(() => ({}));
        expects.push([r.status() === 200 && !!j2.slug, `reslug -> ${r.status()} ${j2.slug}`]);
        if (j2.slug) {
          const o = await api.get(`https://api.nibgate.xyz/api/nibshare/${slug}/meta`);
          const n = await api.get(`https://api.nibgate.xyz/api/nibshare/${j2.slug}/meta`);
          expects.push([o.status() === 404, `old slug -> ${o.status()}`]);
          expects.push([n.status() === 200, `new slug -> ${n.status()}`]);
          await api.delete('https://api.nibgate.xyz/api/nibshare/' + j2.slug).catch(() => {});
        }
      }
      return expects;
    } },
  { id: 'px-10-access-policy', name: 'api-only: access-control toggle invite-only then revert', group: 'platform-api', run: async (h, { page, context }) => {
      await sellerAuthed(page);
      const api = context.request;
      const c = await api.post('https://api.nibgate.xyz/api/nibshare', { data: { title: 'E2E API ACL Tmp', content: 'x', price: '2', status: 'active', publicAccess: true, contentType: 'article' } });
      const slug = (await c.json().catch(() => ({}))).slug;
      const expects = [[!!slug, `created: ${slug}`]];
      if (slug) {
        let r = await api.put(`https://api.nibgate.xyz/api/nibshare/${slug}/access-control`, { data: { publicAccess: false } });
        expects.push([r.status() === 200, `invite-only -> ${r.status()}`]);
        r = await api.get(`https://api.nibgate.xyz/api/nibshare/${slug}/quote?wallet=0x1111111111111111111111111111111111111111`);
        const q = await r.json().catch(() => ({}));
        expects.push([q.canUnlock === false, `non-wl canUnlock=${q.canUnlock}`]);
        r = await api.put(`https://api.nibgate.xyz/api/nibshare/${slug}/access-control`, { data: { publicAccess: true } });
        expects.push([r.status() === 200, `revert -> ${r.status()}`]);
        await api.delete('https://api.nibgate.xyz/api/nibshare/' + slug).catch(() => {});
      }
      return expects;
    } },
  { id: 'px-11-hub-pay-challenge', name: 'api-only: POST /api/hub/pay → 402 x402 challenge (no funds moved)', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.post('https://api.nibgate.xyz/api/hub/pay', { data: { price: '0.01', recipient: BUY, title: 'stress pay' } });
      return [[r.status() === 402, `hub/pay -> ${r.status()}`]];
    } },
  { id: 'px-12-unlock-empty', name: 'api-only: unlock with empty body → challenge shape (not 500)', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.post(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/unlock`, { data: {} });
      return [[r.status() !== 500, `unlock empty body -> ${r.status()}`]];
    } },
  { id: 'px-13-meta-shape', name: 'api-only: meta shape (price/whitelist/visibility)', group: 'platform-api', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get(`https://api.nibgate.xyz/api/nibshare/${FX.paid.slug}/meta`);
      const j = await r.json().catch(() => ({}));
      return [[r.status() === 200, 'meta 200'], [j.price != null, `price=${j.price}`], [j.publicAccess != null, `publicAccess=${j.publicAccess}`]];
    } },
  { id: 'px-14-bogus-type', name: 'api-only: bogus contentType rejected (server validation deployed — #24 fixed)', group: 'platform-api', run: async (h, { page, context }) => {
      await sellerAuthed(page);
      const r = await context.request.post('https://api.nibgate.xyz/api/nibshare', { data: { title: 'E2E Bogus Tmp ' + Date.now().toString(36), content: 'x', contentType: 'not-a-real-type', price: '0', status: 'active' } });
      return [[r.status() === 400, `bogus type -> ${r.status()} (validated server-side now)`]];
    } },
  { id: 'px-15-gateway-balance', name: 'api-only: gateway balance returns SCW vault balance', group: 'platform-api', run: async (h, { page, context }) => {
      await sellerAuthed(page);
      const { makeWallet } = require('../harness/prod-lib.js');
      const { account } = await makeWallet(h.SEL_PK);
      const r = await context.request.post('https://api.nibgate.xyz/api/nibshare/gateway/balance', { data: { address: account.address } });
      const t = await r.text();
      return [[r.status() === 200, `gateway balance -> ${r.status()} ${t.slice(0, 80)}`]];
    } },
];

module.exports = { name: 'batch8-platform-api', checks };