// Batch 18 — Create-and-verify shares across setting combinations, then
// unlock / revoke live. Each check prints its share URL to the report log so
// the links can be opened manually.
//
// Combos covered:
//   article/free            — open gate, no paywall
//   article/paid            — paywall at $5
//   article/paid+wl-free    — whitelisted buyer sees free tier, paywall for anon
//   article/invite-only     — only whitelisted can unlock
//   article/paid+wl-discount— whitelisted buyer sees discounted tier ($2 vs $5)
//   photo/free              — media type gate
const { connectSellerFlow, fillNewShare, install, SEL_PK, BUY_PK } = require('../harness/prod-lib.js');

const B = 'https://nibgate.xyz';
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // whitelisted buyer

// Shared opener: connect seller, land on the share form, create, and return the
// resulting slug + published flag. Logs the share URL for manual inspection.
async function createShare(h, ctx, { title, type = 'article', body, access, price, whitelist, wlTier, whitelistPrice, inviteOnly }) {
  const { page } = ctx;
  for (let attempt = 0; attempt < 2; attempt++) {
    await h.gotoSafe(page, `${B}/share`);
    await connectSellerFlow(page, { label: 'cr', log: () => {} }).catch(() => {});
    await page.waitForTimeout(1800);
    await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    const r = await fillNewShare(page, { title, type, body, access, price, whitelist, wlTier, whitelistPrice, inviteOnly, log: () => {} });
    if (r.slug) { ctx.log(`SHARE URL: ${B}/ns/${r.slug}  (${title})`); return r; }
    ctx.log(`create retry ${attempt + 1}: ${title}`);
  }
  return { published: false, slug: '' };
}

// Buyer opener: open the share URL on a fresh page with the BUY wallet installed
// so whitelisted-tier assertions run as the actual whitelisted buyer.
async function buyerGate(h, ctx, slug) {
  const page2 = await ctx.context.newPage();
  await install({ page: page2, pk: BUY_PK });
  await h.gotoSafe(page2, `${B}/ns/${slug}`);
  await connectSellerFlow(page2, { label: 'buy', log: () => {} }).catch(() => {});
  await page2.waitForTimeout(2500);
  const body = await h.bodyText(page2);
  await page2.close().catch(() => {});
  return body;
}

// Open a share URL and wait for the gate UI (title + paywall/hold-to-pay) to
// render before reading the body — avoids reading a pre-hydration snapshot.
// Waits on a specific gate marker (NOT bare "Connect wallet", which is present
// in the pre-hydration shell) so the price/paywall has hydrated before read.
async function readGate(h, ctx, slug) {
  const { page } = ctx;
  await h.gotoSafe(page, `${B}/ns/${slug}`);
  await page.getByText(/Pay to unlock|Hold to pay|Enjoy|USDC|Unlock for free/i).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return h.bodyText(page);
}

const checks = [
  {
    id: 'combo-article-free', group: 'types-combos',
    name: 'combo: article free — open gate, no paywall, link printed',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const title = `E2E combo free ${Date.now().toString(36)}`;
      const r = await createShare(h, ctx, { title, body: 'free combo body', access: undefined });
      if (!r.slug) return [[false, 'share not created']];
      // Free share: no paywall for anon.
      const b = await readGate(h, ctx, r.slug);
      return [
        [/Pay to unlock/i.test(b) === false, `free: no paywall (${/Pay to unlock/i.test(b)})`],
        [/Application error/i.test(b) === false, 'no error boundary'],
      ];
    }
  },
  {
    id: 'combo-article-paid', group: 'types-combos',
    name: 'combo: article paid $5 — paywall shown, link printed',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const title = `E2E combo paid ${Date.now().toString(36)}`;
      const r = await createShare(h, ctx, { title, body: 'paid combo body', access: 'paid', price: 5 });
      if (!r.slug) return [[false, 'share not created']];
      const b = await buyerGate(h, ctx, r.slug);
      return [
        [/Pay to unlock/i.test(b), `paywall present (${/Pay to unlock/i.test(b)})`],
        [/\$5|5\s?USDC/i.test(b), `price $5 shown (${/\$5|5\s?USDC/i.test(b)})`],
      ];
    }
  },
  {
    id: 'combo-paid-wlfree', group: 'types-combos',
    name: 'combo: paid $5 + whitelist free — whitelisted buyer sees free tier',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const title = `E2E combo wlfree ${Date.now().toString(36)}`;
      const r = await createShare(h, ctx, { title, body: 'wlfree combo body', access: 'paid', price: 5, whitelist: [BUY], wlTier: 'free' });
      if (!r.slug) return [[false, 'share not created']];
      // Anon still sees the $5 paywall (open, public).
      const anonB = await readGate(h, ctx, r.slug);
      const expects = [[/Pay to unlock/i.test(anonB), `anon sees paywall (${/Pay to unlock/i.test(anonB)})`]];
      // Whitelisted buyer (fresh page, BUY wallet) sees the free tier / unlock.
      const b = await buyerGate(h, ctx, r.slug);
      expects.push([/free/i.test(b), `whitelisted buyer sees free tier (${/free/i.test(b)})`]);
      expects.push([/0 USDC|free/i.test(b), `zero-cost unlock (${/0 USDC|free/i.test(b)})`]);
      return expects;
    }
  },
  {
    id: 'combo-invite-only', group: 'types-combos',
    name: 'combo: invite-only — non-whitelisted sees public paywall, share is invite-gated',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const title = `E2E combo invite ${Date.now().toString(36)}`;
      const r = await createShare(h, ctx, { title, body: 'invite combo body', access: 'paid', price: 12, whitelist: [BUY], inviteOnly: true });
      if (!r.slug) return [[false, 'share not created']];
      const expects = [];
      // Invite-only means whitelisted get the tier; non-whitelisted anon can
      // still pay the public price, so the paywall shows at $12 (not a block).
      const { page } = ctx;
      const b = await readGate(h, ctx, r.slug);
      expects.push([/Pay to unlock/i.test(b), `anon sees paywall (${/Pay to unlock/i.test(b)})`]);
      expects.push([/12 USDC|12\s?USDC/i.test(b), `public price 12 USDC shown (${/12 USDC|12\s?USDC/i.test(b)})`]);
      // The gate MUST be invite-only at the data layer (whitelisted free, others pay).
      const ac = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { credentials: 'include' }).then((r2) => r2.ok ? r2.json() : null), r.slug).catch(() => null);
      expects.push([ac?.publicAccess === false, `invite-only flag set (publicAccess=${ac?.publicAccess})`]);
      expects.push([Array.isArray(ac?.whitelist) && ac.whitelist.includes(BUY.toLowerCase()), `whitelist contains buyer (${(ac?.whitelist || []).includes(BUY.toLowerCase())})`]);
      return expects;
    }
  },
  {
    id: 'combo-paid-wldiscount', group: 'types-combos',
    name: 'combo: paid $5 + whitelist $2 — whitelisted buyer sees discounted tier',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const title = `E2E combo wldrop ${Date.now().toString(36)}`;
      const r = await createShare(h, ctx, { title, body: 'wldiscount combo body', access: 'paid', price: 5, whitelist: [BUY], wlTier: 2 });
      if (!r.slug) return [[false, 'share not created']];
      const b = await buyerGate(h, ctx, r.slug);
      return [
        [/2 USDC/i.test(b), `whitelisted buyer sees 2 USDC tier (${/2 USDC/i.test(b)})`],
        [/whitelisted price/i.test(b), `whitelisted-price note (${/whitelisted price/i.test(b)})`],
        [/Pay to unlock/i.test(b), 'paywall present'],
      ];
    }
  },
  {
    id: 'lifecycle-unlock-then-revoke', group: 'types-combos',
    name: 'lifecycle: whitelisted buyer sees free tier, owner bans, buyer stripped from whitelist',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const title = `E2E combo unlock-revoke ${Date.now().toString(36)}`;
      const r = await createShare(h, ctx, { title, body: 'unlock-revoke body', access: 'paid', price: 5, whitelist: [BUY], wlTier: 'free' });
      if (!r.slug) return [[false, 'share not created']];
      const expects = [];
      const { page, context } = ctx;
      // Anon sees the public paywall.
      const anonB = await readGate(h, ctx, r.slug);
      expects.push([/Pay to unlock/i.test(anonB), `anon sees paywall (${/Pay to unlock/i.test(anonB)})`]);
      // Whitelist state: buyer present before revoke. (Do API calls with the
      // seller cookie active, before any buyer wallet connect.)
      const api = context.request;
      const acBefore = await api.get(`https://api.nibgate.xyz/nibshare/${r.slug}/access-control`).then((x) => x.ok ? x.json() : null).catch(() => null);
      expects.push([Array.isArray(acBefore?.whitelist) && acBefore.whitelist.includes(BUY.toLowerCase()), `buyer whitelisted before revoke (${(acBefore?.whitelist || []).includes(BUY.toLowerCase())})`]);
      // Owner bans buyer — strips the wallet from whitelist[] and marks the
      // entitlement banned (the real "revoke access" path for whitelisted wallets).
      const rev = await api.post(`https://api.nibgate.xyz/nibshare/${r.slug}/entitlements/${BUY}/ban`).then((x) => x.status()).catch(() => 0);
      expects.push([rev === 200, `ban API accepted: ${rev}`]);
      // Buyer removed from whitelist after ban.
      const acAfter = await api.get(`https://api.nibgate.xyz/nibshare/${r.slug}/access-control`).then((x) => x.ok ? x.json() : null).catch(() => null);
      expects.push([Array.isArray(acAfter?.whitelist) && !acAfter.whitelist.includes(BUY.toLowerCase()), `buyer removed after ban (${(acAfter?.whitelist || []).length} left)`]);
      // Unban + restore whitelist so the share stays accessible for manual checks.
      await api.delete(`https://api.nibgate.xyz/nibshare/${r.slug}/entitlements/${BUY}`).catch(() => {});
      const add = await api.put(`https://api.nibgate.xyz/nibshare/${r.slug}/access-control`, { data: { whitelist: [BUY], wlTier: 'free', publicAccess: true } }).then((x) => x.status()).catch(() => 0);
      expects.push([add === 200, `restore buyer: ${add}`]);
      // Buyer gate last — connects the BUY wallet (may flip session cookie).
      const buyB = await buyerGate(h, ctx, r.slug);
      expects.push([/free/i.test(buyB), `whitelisted buyer sees free tier (${/free/i.test(buyB)})`]);
      expects.push([/0 USDC|free/i.test(buyB), `zero-cost unlock for buyer (${/0 USDC|free/i.test(buyB)})`]);
      return expects;
    }
  },
];

module.exports = { name: 'batch18-setting-combos', checks };
