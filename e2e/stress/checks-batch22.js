// Batch 22 — Viewer-side entitlement states (quote.revoked / quote.banned UI):
//   - revoke then revisit: whitelisted buyer who unlocked free, then the owner
//     revokes → viewer sees the "previous access was revoked" banner
//   - ban then revisit: banned viewer sees the "Banned" gate
//   - restore (DELETE entitlement) then revisit: ban lifted, gate usable again
const { connectSellerFlow, fillNewShare, install, SEL_PK, BUY_PK } = require('../harness/prod-lib.js');

const B = 'https://nibgate.xyz';
const API = 'https://api.nibgate.xyz';
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

async function createShare(h, ctx, { title, type = 'article', body, access, price, whitelist, wlTier, inviteOnly }) {
  const { page } = ctx;
  for (let attempt = 0; attempt < 2; attempt++) {
    await h.gotoSafe(page, `${B}/share`);
    await connectSellerFlow(page, { label: 'cr22', log: () => {} }).catch(() => {});
    await page.waitForTimeout(1800);
    // Dismiss any leftover wallet modal so the editor click isn't intercepted.
    await page.locator('w3m-modal').first().evaluate((el) => el.remove()).catch(() => {});
    await page.getByTitle('Close').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    // Fast-fail on the title input so a flaky load doesn't burn the 35s default.
    const titleVisible = await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().isVisible({ timeout: 6000 }).catch(() => false);
    if (!titleVisible) { ctx.log(`create retry ${attempt + 1}: title input not ready`); continue; }
    try {
      const r = await fillNewShare(page, { title, type, body, access, price, whitelist, wlTier, inviteOnly, log: () => {} });
      if (r.slug) { ctx.log(`SHARE URL: ${B}/ns/${r.slug}  (${title})`); return r; }
    } catch (e) {
      ctx.log(`create threw (${e.message.slice(0, 60)}) — retry ${attempt + 1}`);
    }
    ctx.log(`create retry ${attempt + 1}: ${title}`);
  }
  return { published: false, slug: '' };
}

// Viewer opens the share, optionally free-unlocks, and returns the gate body.
// Uses a dedicated browser context so appkit connects cleanly regardless of
// prior sign-ins in the seller's shared context. When `keepOpen` is set the
// browser is returned (caller must close) so a second view of the same share
// can reuse the already-connected buyer without a fresh connect.
async function viewerPage(h, ctx, slug, { unlockFree = false, keepOpen = false } = {}) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: BUY_PK });
  await page.goto(`${B}/ns/${slug}`, { waitUntil: 'commit', timeout: 35000 });
  await connectSellerFlow(page, { label: 'vw22', log: () => {} }).catch(() => {});
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

// Owner-side API call: the buyer sign-in on a shared context overwrites the
// seller's session cookie, and appkit persists the last-connected provider in
// the context's localStorage (so a fresh page in the same context auto-reconnects
// the buyer). Use a dedicated browser context so the seller connects cleanly.
async function ownerApi(h, ctx, slug, verb) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto(`${B}/share/mine`, { waitUntil: 'commit', timeout: 35000 });
  const addr = await connectSellerFlow(page, { label: 'ow22', log: () => {} }).catch(() => '');
  ctx.log(`ownerApi connected as: ${addr}`);
  await page.waitForTimeout(800);
  const method = verb === '/restore' ? 'DELETE' : 'POST';
  const url = `/nibshare/${slug}/entitlements/${BUY}${verb === '/restore' ? '' : verb}`;
  const result = await page.evaluate(({ url, method }) => fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status), { url, method });
  await browser.close().catch(() => {});
  return result;
}

const checks = [
  {
    id: 'vg-revoked-banner-after-unlock', group: 'types-viewer-state',
    name: 'viewer: whitelisted buyer unlocks free, then revoke shows revoked banner',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await createShare(h, ctx, {
        title: `E2E revoke-banner ${Date.now().toString(36)}`,
        type: 'article', body: 'revoke banner body', access: 'paid', price: 5,
        whitelist: [BUY], wlTier: 'free',
      });
      if (!published) return [[false, `share not published (${slug})`]];
      const t0 = Date.now();
      const { browser: buyerBrowser, page: buyerPage, body: afterUnlock } = await viewerPage(h, ctx, slug, { unlockFree: true, keepOpen: true });
      const expects = [[/revoke banner body/.test(afterUnlock), `unlocked for free (${/revoke banner body/.test(afterUnlock)})`]];
      // Owner revokes the buyer entitlement via API (dedicated seller browser).
      const revoke = await ownerApi(h, ctx, slug, '/revoke');
      expects.push([revoke === 200, `revoke 200 (${revoke})`]);
      // Reuse the still-connected buyer browser: reload the share and read the gate.
      await buyerPage.goto(`${B}/ns/${slug}`, { waitUntil: 'commit', timeout: 35000 }).catch(() => {});
      await buyerPage.waitForTimeout(3500);
      const afterRevoke = await h.bodyText(buyerPage);
      await buyerBrowser.close().catch(() => {});
      expects.push([/previous access was revoked|revoked/i.test(afterRevoke), `revoked banner shown (${/previous access was revoked|revoked/i.test(afterRevoke)})`]);
      expects.push([!/revoke banner body/.test(afterRevoke), 'no content leak after revoke']);
      return expects;
      return expects;
    }
  },
  {
    id: 'vg-ban-banner', group: 'types-viewer-state',
    name: 'viewer: banned wallet sees Banned gate, no content',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await createShare(h, ctx, {
        title: `E2E ban-banner ${Date.now().toString(36)}`,
        type: 'article', body: 'ban banner body', access: 'paid', price: 5,
        whitelist: [BUY], wlTier: 'free',
      });
      if (!published) return [[false, `share not published (${slug})`]];
      const ban = await page.evaluate(({ slug, wallet }) => fetch(`/nibshare/${slug}/entitlements/${wallet}/ban`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status), { slug, wallet: BUY });
      const expects = [[ban === 200, `ban 200 (${ban})`]];
      await page.waitForTimeout(800);
      const body = await viewerPage(h, ctx, slug);
      expects.push([/Banned|No access/i.test(body), `Banned gate shown (${/Banned|No access/i.test(body)})`]);
      expects.push([!/ban banner body/.test(body), 'no content leak']);
      return expects;
    }
  },
  {
    id: 'vg-restore-lifts-ban', group: 'types-viewer-state',
    name: 'viewer: restore (DELETE entitlement) lifts the Banned gate (whitelist membership stays stripped)',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await createShare(h, ctx, {
        title: `E2E restore ${Date.now().toString(36)}`,
        type: 'article', body: 'restore body', access: 'paid', price: 5,
        whitelist: [BUY], wlTier: 'free',
      });
      if (!published) return [[false, `share not published (${slug})`]];
      const ban = await page.evaluate(({ slug, wallet }) => fetch(`/nibshare/${slug}/entitlements/${wallet}/ban`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status), { slug, wallet: BUY });
      const expects = [[ban === 200, `ban 200 (${ban})`]];
      const banned = await viewerPage(h, ctx, slug);
      expects.push([/Banned|No access/i.test(banned), `banned before restore (${/Banned|No access/i.test(banned)})`]);
      const restore = await ownerApi(h, ctx, slug, '/restore');
      expects.push([restore === 200, `restore 200 (${restore})`]);
      await page.waitForTimeout(800);
      // Restore lifts the ban but does NOT re-add whitelist membership (ban
      // strips it), so the buyer loses the free tier and sees the paywall again.
      const after = await viewerPage(h, ctx, slug);
      expects.push([!/Banned|No access/i.test(after), `Banned gate lifted (${!/Banned|No access/i.test(after)})`]);
      expects.push([/Pay to unlock/i.test(after), `paywall returns after restore (${/Pay to unlock/i.test(after)})`]);
      expects.push([!/restore body/.test(after), 'no content leak']);
      return expects;
    }
  },
];

module.exports = { name: 'batch22-viewer-entitlement-state', checks };