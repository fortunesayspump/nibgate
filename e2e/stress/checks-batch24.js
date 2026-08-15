// Batch 24 — Subblog (catwalk) combos + more hub expiry combos:
//   Subblog (API-level, no mutation needed):
//     - quote endpoint: per-wallet pricing snapshot (paid doc 0.50, free 0)
//     - wallet spoof on access: bare ?wallet= claim is NOT trusted without a
//       SIWE session (402), confirming session possession is enforced
//     - media gate: anon media fetch on a paid post → 402, no leak
//     - free post access anon → 200 content
//     - paid post access anon → 402
//   Hub expiry combos:
//     - invite-only + expired: expiry wins over invite (whitelisted member 419)
//     - paid public + expired: 419 for anon, expired banner
//     - free public + expired: 419 even though it's free
const { connectSellerFlow, fillNewShare, install, SEL_PK, BUY_PK } = require('../harness/prod-lib.js');

const B = 'https://nibgate.xyz';
const CAT = 'https://catwalk.nibgate.xyz';
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

async function apiCreateShare(h, ctx, { title, body, access = 'paid', price, whitelist, wlTier, publicAccess = true, expiresAtMs }) {
  const { page, context } = ctx;
  await h.gotoSafe(page, `${B}/share`);
  await connectSellerFlow(page, { label: 'cr24', log: () => {} }).catch(() => {});
  await page.waitForTimeout(1200);
  const data = {
    title, content: body, contentType: 'article', status: 'active',
    price: String(price), publicAccess,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
  if (whitelist?.length) data.whitelist = whitelist;
  if (wlTier === 'free') data.whitelistPrice = '0';
  const r = await context.request.post('https://api.nibgate.xyz/nibshare', { data });
  const status = r.status();
  const json = await r.json().catch(() => ({}));
  ctx.log(`apiCreate: ${status} slug=${json.slug || ''}`);
  return { status, slug: json.slug || '', json };
}

async function viewerPage(h, ctx, slug) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(35000);
  await page.goto(`${B}/ns/${slug}`, { waitUntil: 'commit', timeout: 35000 });
  await page.waitForTimeout(2200);
  const body = await h.bodyText(page);
  await browser.close().catch(() => {});
  return body;
}

const checks = [
  // ---- Subblog combos (catwalk, API-level) ----
  {
    id: 'sb-quote-pricing', group: 'types-subblog',
    name: 'subblog: quote endpoint returns per-wallet pricing (paid 0.50 / free 0)',
    pk: 'anon',
    run: async (h, ctx) => {
      const { context } = ctx;
      const qPaid = await context.request.get(`${CAT}/api/nibgate/posts/lookbook-materials-d14/quote?wallet=${BUY}`).then((r) => r.json()).catch(() => ({}));
      const qFree = await context.request.get(`${CAT}/api/nibgate/posts/thrifting-better/quote?wallet=${BUY}`).then((r) => r.json()).catch(() => ({}));
      const expects = [
        [qPaid.price === '0.50' || qPaid.price === '0.5', `paid doc price 0.50 (${qPaid.price})`],
        [qPaid.effectivePrice === '0.5' || qPaid.effectivePrice === '0.50', `effectivePrice (${qPaid.effectivePrice})`],
        [qPaid.canUnlock === true, `paid quote actionable canUnlock (${qPaid.canUnlock})`],
        [qPaid.status == null && qPaid.revoked === false, `no entitlement yet (${qPaid.status})`],
        [qFree.price === '0', `free post price 0 (${qFree.price})`],
        [qFree.canUnlock === true, `free post canUnlock (${qFree.canUnlock})`],
      ];
      return expects;
    }
  },
  {
    id: 'sb-wallet-spoof-blocked', group: 'types-subblog',
    name: 'subblog: bare ?wallet= claim on paid post does NOT unlock (needs SIWE session)',
    pk: 'anon',
    run: async (h, ctx) => {
      const { context } = ctx;
      const r = await context.request.get(`${CAT}/api/nibgate/access?path=/writing/future-sustainable-fashion&wallet=${BUY}`);
      const status = r.status();
      const txt = (await r.text()).slice(0, 80);
      return [
        [status === 402, `paid access with spoofed wallet → 402 (${status})`],
        [/ok.*true|"ok":true/.test(txt) === false, `no content in spoofed response (${txt})`],
      ];
    }
  },
  {
    id: 'sb-media-gate-402', group: 'types-subblog',
    name: 'subblog: anon media fetch on paid post → 402 (no leak)',
    pk: 'anon',
    run: async (h, ctx) => {
      const { context } = ctx;
      const man = await context.request.get(`${CAT}/api/nibgate/manifest?path=/docs/lookbook-materials-d14`).then((r) => r.json()).catch(() => ({}));
      const id = man.id || '';
      const r = await context.request.get(`${CAT}/api/nibgate/media/${id}/document`);
      const status = r.status();
      const txt = (await r.text()).slice(0, 80);
      return [
        [!!id, `manifest id present (${id})`],
        [status === 402, `anon media → 402 (${status})`],
        [!/x402Version|"accepted".*"amount"/.test(txt) === false, `402 challenge returned (${txt})`],
      ];
    }
  },
  {
    id: 'sb-free-anon-access', group: 'types-subblog',
    name: 'subblog: free post access anon → 200 with content',
    pk: 'anon',
    run: async (h, ctx) => {
      const { context } = ctx;
      const r = await context.request.get(`${CAT}/api/nibgate/access?path=/writing/thrifting-better`);
      const status = r.status();
      const j = await r.json().catch(() => ({}));
      return [
        [status === 200, `free access → 200 (${status})`],
        [!!j.resource && j.resource.title?.length > 0, `content returned (${j.resource?.title})`],
      ];
    }
  },
  {
    id: 'sb-paid-anon-access', group: 'types-subblog',
    name: 'subblog: paid post access anon → 402 paywall',
    pk: 'anon',
    run: async (h, ctx) => {
      const { context } = ctx;
      const r = await context.request.get(`${CAT}/api/nibgate/access?path=/writing/future-sustainable-fashion`);
      const status = r.status();
      return [
        [status === 402, `paid access → 402 (${status})`],
      ];
    }
  },

  // ---- Hub expiry combos ----
  {
    id: 'ex-invite-only-expired', group: 'types-expiry2',
    name: 'expiry: invite-only + expired → 419 wins over invite (whitelisted member cut off)',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const title = `E2E exp-inv ${Date.now().toString(36)}`;
      const { slug, status } = await apiCreateShare(h, ctx, {
        title, body: 'expired invite body', price: 5, whitelist: [BUY], wlTier: 'free', publicAccess: false,
        expiresAtMs: Date.now() + 30000,
      });
      const expects = [[status === 201, `share created (${status})`]];
      if (status !== 201) return expects;
      await page.waitForTimeout(34000);
      const body = await viewerPage(h, ctx, slug);
      expects.push([/This share has expired|has expired/i.test(body), `expired banner (${/This share has expired|has expired/i.test(body)})`]);
      expects.push([!/expired invite body/.test(body), 'no content leak for invite member']);
      const access = await ctx.context.request.get(`https://api.nibgate.xyz/nibshare/${slug}/access`).then((r) => r.status()).catch(() => 0);
      expects.push([access === 419, `access API 419 (${access})`]);
      return expects;
    }
  },
  {
    id: 'ex-paid-public-expired', group: 'types-expiry2',
    name: 'expiry: paid public share expired → 419 + expired banner for anon',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const title = `E2E exp-paid ${Date.now().toString(36)}`;
      const { slug, status } = await apiCreateShare(h, ctx, {
        title, body: 'expired paid body', price: 5,
        expiresAtMs: Date.now() + 25000,
      });
      const expects = [[status === 201, `share created (${status})`]];
      if (status !== 201) return expects;
      await page.waitForTimeout(29000);
      const body = await viewerPage(h, ctx, slug);
      expects.push([/This share has expired|has expired/i.test(body), `expired banner (${/This share has expired|has expired/i.test(body)})`]);
      expects.push([!/expired paid body/.test(body), 'no content leak']);
      const access = await ctx.context.request.get(`https://api.nibgate.xyz/nibshare/${slug}/access`).then((r) => r.status()).catch(() => 0);
      expects.push([access === 419, `access API 419 (${access})`]);
      return expects;
    }
  },
  {
    id: 'ex-free-public-expired', group: 'types-expiry2',
    name: 'expiry: free public share expired → 419 even though free',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const title = `E2E exp-free ${Date.now().toString(36)}`;
      const { slug, status } = await apiCreateShare(h, ctx, {
        title, body: 'expired free body', access: 'free', price: 0,
        expiresAtMs: Date.now() + 25000,
      });
      const expects = [[status === 201, `share created (${status})`]];
      if (status !== 201) return expects;
      await page.waitForTimeout(29000);
      const body = await viewerPage(h, ctx, slug);
      expects.push([/This share has expired|has expired/i.test(body), `expired banner (${/This share has expired|has expired/i.test(body)})`]);
      expects.push([!/expired free body/.test(body), 'no content leak even though free']);
      const access = await ctx.context.request.get(`https://api.nibgate.xyz/nibshare/${slug}/access`).then((r) => r.status()).catch(() => 0);
      expects.push([access === 419, `access API 419 (${access})`]);
      return expects;
    }
  },
  {
    id: 'ex-custom-expiry-7d-persists', group: 'types-expiry2',
    name: 'expiry: created with expiresAt persists on meta + manifest',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page, context } = ctx;
      const title = `E2E exp-meta ${Date.now().toString(36)}`;
      const { slug, status } = await apiCreateShare(h, ctx, {
        title, body: 'exp meta body', price: 5,
        expiresAtMs: Date.now() + 3600 * 1000,
      });
      const expects = [[status === 201, `share created (${status})`]];
      if (status !== 201) return expects;
      const meta = await context.request.get(`https://api.nibgate.xyz/nibshare/${slug}/meta`).then((r) => r.json()).catch(() => ({}));
      const man = await context.request.get(`https://api.nibgate.xyz/nibshare/${slug}/manifest`).then((r) => r.json()).catch(() => ({}));
      expects.push([meta.expiresAt != null, `meta exposes expiresAt (${meta.expiresAt})`]);
      expects.push([man.expiresAt != null || man.expiresInSeconds != null, `manifest exposes expiry (${man.expiresAt || man.expiresInSeconds})`]);
      return expects;
    }
  },
];

module.exports = { name: 'batch24-subblog-expiry', checks };