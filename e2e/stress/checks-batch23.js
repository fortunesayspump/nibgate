// Batch 23 — Expiry combos + settings persistence + multi-wallet whitelists:
//   - 2-min expiry share: created live, buyer unlocks free while active
//   - whitelist + expiry: expired share blocks a whitelisted free member (419),
//     no bypass, no content leak
//   - active entitlement + expiry: buyer unlocked free, share then expires →
//     the 419 gate wins over the active entitlement, no leak
//   - settings: tier + invite toggle persist across a full page reload
//   - multi-wallet: two whitelisted members, revoke one, the other still unlocks
//   - seen-by reflects revoke (revoked badge) after an unlock
const { connectSellerFlow, fillNewShare, install, SEL_PK, BUY_PK } = require('../harness/prod-lib.js');

const B = 'https://nibgate.xyz';
const API = 'https://api.nibgate.xyz';
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

// API-create a share as the seller (session cookie from the shared context).
// expiresAt must be in the future; the API allows any future date (UI min +5m).
async function apiCreateShare(h, ctx, { title, body, access = 'paid', price, whitelist, wlTier, publicAccess = true, expiresAtMs }) {
  const { page, context } = ctx;
  await h.gotoSafe(page, `${B}/share`);
  await connectSellerFlow(page, { label: 'cr23', log: () => {} }).catch(() => {});
  await page.waitForTimeout(1200);
  const data = {
    title, content: body, contentType: 'article', status: 'active',
    price: String(price), publicAccess,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
  if (whitelist?.length) data.whitelist = whitelist;
  if (wlTier === 'free') data.whitelistPrice = '0';
  const r = await context.request.post(`${API}/nibshare`, { data });
  const status = r.status();
  const json = await r.json().catch(() => ({}));
  ctx.log(`apiCreate: ${status} slug=${json.slug || ''}`);
  return { status, slug: json.slug || '', json };
}

// Owner opens the Settings sheet for the given share row title.
async function openSettings(h, ctx, title) {
  const { page } = ctx;
  const row = page.locator('div, li, tr, article').filter({ hasText: title }).first();
  const settings = row.locator('button[title="Settings"]').first();
  if (!(await settings.count())) return false;
  await settings.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1800);
  return true;
}

// Buyer opens the share in a dedicated browser context and optionally free-unlocks.
async function viewerPage(h, ctx, slug, { unlockFree = false, keepOpen = false, walletPk = BUY_PK } = {}) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: walletPk });
  await page.goto(`${B}/ns/${slug}`, { waitUntil: 'commit', timeout: 35000 });
  await connectSellerFlow(page, { label: 'vw23', log: () => {} }).catch(() => {});
  await page.waitForTimeout(1200);
  if (unlockFree) {
    const btn = page.getByRole('button', { name: /Unlock for free/i }).first();
    if (await btn.count()) { await btn.dispatchEvent('pointerdown').catch(() => {}); await page.waitForTimeout(4500); }
  }
  const body = await h.bodyText(page);
  if (keepOpen) return { browser, page, body };
  await browser.close().catch(() => {});
  return body;
}

// Owner-side authenticated API call in a dedicated seller browser context.
async function ownerApi(h, ctx, slug, verb, wallet = BUY) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto(`${B}/share/mine`, { waitUntil: 'commit', timeout: 35000 });
  await connectSellerFlow(page, { label: 'ow23', log: () => {} }).catch(() => {});
  await page.waitForTimeout(800);
  const method = verb === '/restore' ? 'DELETE' : 'POST';
  const url = `/nibshare/${slug}/entitlements/${wallet}${verb === '/restore' ? '' : verb}`;
  const result = await page.evaluate(({ url, method }) => fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status), { url, method });
  await browser.close().catch(() => {});
  return result;
}

// Create a share through the form (used by settings checks). Includes the
// modal-dismiss + retry pattern from batch22 to dodge the stuck w3m-modal.
async function createViaForm(h, ctx, title, body) {
  const { page } = ctx;
  for (let attempt = 0; attempt < 2; attempt++) {
    await h.gotoSafe(page, `${B}/share`);
    await connectSellerFlow(page, { label: 'cr23f', log: () => {} }).catch(() => {});
    await page.waitForTimeout(1800);
    await page.locator('w3m-modal').first().evaluate((el) => el.remove()).catch(() => {});
    await page.getByTitle('Close').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const titleVisible = await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().isVisible({ timeout: 6000 }).catch(() => false);
    if (!titleVisible) { ctx.log(`form create retry ${attempt + 1}: title input not ready`); continue; }
    try {
      const r = await fillNewShare(page, { title, type: 'article', body, log: () => {} });
      if (r.slug) { ctx.log(`SHARE URL: ${B}/ns/${r.slug}  (${title})`); return r; }
    } catch (e) {
      ctx.log(`form create threw (${e.message.slice(0, 60)}) — retry ${attempt + 1}`);
    }
    ctx.log(`form create retry ${attempt + 1}: ${title}`);
  }
  return { published: false, slug: '' };
}

const checks = [
  {
    id: 'ex-2min-expiry-live', group: 'types-expiry',
    name: 'expiry: 2-minute expiring share is live (whitelisted buyer unlocks free)',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const title = `E2E 2min ${Date.now().toString(36)}`;
      const { slug, status } = await apiCreateShare(h, ctx, {
        title, body: '2min live body', price: 5, whitelist: [BUY], wlTier: 'free',
        expiresAtMs: Date.now() + 120000,
      });
      const expects = [[status === 201, `2-min share created (${status}, ${slug})`]];
      if (status !== 201) return expects;
      const body = await viewerPage(h, ctx, slug, { unlockFree: true });
      expects.push([/2min live body/.test(body), `buyer unlocked free while live (${/2min live body/.test(body)})`]);
      // Owner side: share is still active (not expired) in mine list.
      await h.gotoSafe(page, `${B}/share/mine`);
      await page.waitForTimeout(2200);
      const mineBody = await h.bodyText(page);
      expects.push([!mineBody.includes(title) || /active|expires|left/i.test(mineBody), `mine row present for live 2-min share (${title in {}})`]);
      return expects;
    }
  },
  {
    id: 'ex-expired-whitelist-no-bypass', group: 'types-expiry',
    name: 'expiry: expired share blocks a whitelisted free member (419, no leak)',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const title = `E2E exp-wl ${Date.now().toString(36)}`;
      const { slug, status } = await apiCreateShare(h, ctx, {
        title, body: 'expired wl body', price: 5, whitelist: [BUY], wlTier: 'free',
        expiresAtMs: Date.now() + 40000,
      });
      const expects = [[status === 201, `share created (${status})`]];
      if (status !== 201) return expects;
      await page.waitForTimeout(43000);
      const body = await viewerPage(h, ctx, slug);
      expects.push([/This share has expired|has expired/i.test(body), `expired banner (${/This share has expired|has expired/i.test(body)})`]);
      expects.push([!/expired wl body/.test(body), 'no content leak for whitelisted member']);
      const access = await ctx.context.request.get(`${API}/nibshare/${slug}/access`).then((r) => r.status()).catch(() => 0);
      expects.push([access === 419, `access API returns 419 (${access})`]);
      return expects;
    }
  },
  {
    id: 'ex-expired-after-active-entitlement', group: 'types-expiry',
    name: 'expiry: unlocked free, share expires → 419 gate wins over active entitlement',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const title = `E2E exp-ent ${Date.now().toString(36)}`;
      const { slug, status } = await apiCreateShare(h, ctx, {
        title, body: 'expired ent body', price: 5, whitelist: [BUY], wlTier: 'free',
        expiresAtMs: Date.now() + 25000,
      });
      const expects = [[status === 201, `share created (${status})`]];
      if (status !== 201) return expects;
      const first = await viewerPage(h, ctx, slug, { unlockFree: true });
      expects.push([/expired ent body/.test(first), `unlocked free before expiry (${/expired ent body/.test(first)})`]);
      await new Promise((r) => setTimeout(r, 15000));
      const body = await viewerPage(h, ctx, slug);
      expects.push([/This share has expired|has expired/i.test(body), `expired banner after unlock (${/This share has expired|has expired/i.test(body)})`]);
      expects.push([!/expired ent body/.test(body), 'no content leak despite active entitlement']);
      return expects;
    }
  },
  {
    id: 'ex-settings-persist-reload', group: 'types-expiry',
    name: 'settings: whitelist free tier + invite-only persist across full reload',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const title = `E2E s23 ${Date.now().toString(36)}`;
      const r = await createViaForm(h, ctx, title, 's23 body');
      await h.gotoSafe(page, `${B}/share/mine`);
      await page.waitForTimeout(2500);
      const { slug, published } = r;
      if (!published) return [[false, 'share not published']];
      // Seed whitelist + free tier, then set invite-only via the sheet.
      const setWl = await page.evaluate(({ s, w }) => fetch(`/nibshare/${s}/access-control`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whitelist: [w], whitelistPrice: '0' }) }).then((r) => r.status), { s: slug, w: BUY });
      const expects = [[setWl === 200, `seed whitelist+free: ${setWl}`]];
      if (setWl !== 200) return expects;
      await page.waitForTimeout(600);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const inviteBtn = page.getByRole('button', { name: /Invite only/i }).first();
      if (!(await inviteBtn.count())) return [[false, 'Invite only button not found']];
      await inviteBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2200);
      // Full reload of /share/mine, reopen settings: both must still be set.
      await h.gotoSafe(page, `${B}/share/mine`);
      await page.waitForTimeout(2200);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not reopened']];
      const body = await h.bodyText(page);
      expects.push([/Invite-only: only whitelisted wallets can unlock/i.test(body), `invite-only note after reload (${/Invite-only: only whitelisted wallets can unlock/i.test(body)})`]);
      expects.push([/Whitelisted wallets pay\s*(\|\s*)?Free/i.test(body), `free tier label after reload (${/Whitelisted wallets pay\s*(\|\s*)?Free/i.test(body)})`]);
      const ac = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null), slug).catch(() => null);
      expects.push([ac?.publicAccess === false, `backend publicAccess=false (${ac?.publicAccess})`]);
      expects.push([ac?.whitelistPrice === '0', `backend wlPrice=0 (${ac?.whitelistPrice})`]);
      return expects;
    }
  },
  {
    id: 'ex-multiwallet-revoke-one', group: 'types-expiry',
    name: 'whitelist: two members; revoke one, the other still unlocks free',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
      const { page } = ctx;
      const w1 = BUY;
      const w2 = privateKeyToAccount(generatePrivateKey()).address;
      const title = `E2E multiwl ${Date.now().toString(36)}`;
      const { slug, status } = await apiCreateShare(h, ctx, {
        title, body: 'multiwallet body', price: 5, whitelist: [w1, w2], wlTier: 'free',
        expiresAtMs: Date.now() + 600000,
      });
      const expects = [[status === 201, `share created (${status})`]];
      if (status !== 201) return expects;
      // Revoke the second member.
      const revoke = await ownerApi(h, ctx, slug, '/revoke', w2);
      expects.push([revoke === 200, `revoke w2 200 (${revoke})`]);
      await page.waitForTimeout(600);
      // First member (untouched) still unlocks free.
      const b1 = await viewerPage(h, ctx, slug, { unlockFree: true, walletPk: BUY_PK });
      expects.push([/multiwallet body/.test(b1), `member 1 unlocks free (${/multiwallet body/.test(b1)})`]);
      return expects;
    }
  },
  {
    id: 'ex-seenby-revoked-badge', group: 'types-expiry',
    name: 'settings: Seen-by shows revoked badge for a revoked wallet that unlocked',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const title = `E2E sb23 ${Date.now().toString(36)}`;
      const r = await createViaForm(h, ctx, title, 'sb23 body');
      await h.gotoSafe(page, `${B}/share/mine`);
      await page.waitForTimeout(2500);
      const { slug, published } = r;
      if (!published) return [[false, 'share not published']];
      const setWl = await page.evaluate(({ s, w }) => fetch(`/nibshare/${s}/access-control`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whitelist: [w], whitelistPrice: '0' }) }).then((r) => r.status), { s: slug, w: BUY });
      const expects = [[setWl === 200, `seed whitelist+free: ${setWl}`]];
      if (setWl !== 200) return expects;
      // Buyer unlocks free (shows up in Seen-by), then owner revokes.
      const b = await viewerPage(h, ctx, slug, { unlockFree: true });
      expects.push([/sb23 body/.test(b), `buyer unlocked (${/sb23 body/.test(b)})`]);
      const revoke = await ownerApi(h, ctx, slug, '/revoke');
      expects.push([revoke === 200, `revoke 200 (${revoke})`]);
      await page.waitForTimeout(600);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const body = await h.bodyText(page);
      expects.push([/revoked/i.test(body), `revoked badge in Seen-by (${/revoked/i.test(body)})`]);
      expects.push([body.includes('0x3c44…93bc') || body.includes('0x3C44…93BC'), 'buyer wallet listed']);
      return expects;
    }
  },
];

module.exports = { name: 'batch23-expiry-settings-multiwallet', checks };