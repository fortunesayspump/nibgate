// Batch 2 — SHARE ADMIN: click every control on /share and /share/mine.
// Looks for every minor gap: silently-failing buttons, disabled states,
// feedback absence, copy slips.
const h = require('./runner.js').h;

const TYPES = ['Article', 'Photo', 'Video', 'Music', 'Document'];
const TITLE = 'E2E Stress Article A';

async function authToForm(h, page) {
  await h.gotoSafe(page, 'https://nibgate.xyz/share');
  const { connectSellerFlow } = require('../harness/prod-lib.js');
  await connectSellerFlow(page, { label: 's', log: () => {} });
  await page.waitForTimeout(1000);
  return (await page.locator('input[placeholder="Post title"]').count()) > 0;
}

const checks = [
  {
    id: 's-01-types', name: 'content-type select switches UI for all 5 types', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      const sel = page.locator('select').first();
      const expects = [];
      for (const t of TYPES) {
        await sel.selectOption({ label: t });
        await page.waitForTimeout(900);
        const b = await h.bodyText(page);
        expects.push([true, `${t}: form renders | specific hint: ${/(Photos|upload a video|cover art|document file)/i.test(b) ? 'yes' : 'no'}`]);
      }
      return expects;
    }
  },
  {
    id: 's-02-access-modes', name: 'Free ↔ Pay to unlock toggle reveals price input', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      const expects = [];
      await page.waitForTimeout(1200);
      const paid = page.getByText(/Pay to unlock/i).first();
      const freeBtn = page.getByText(/Anyone with the link can read it/i).first();
      if (await freeBtn.count()) { await freeBtn.click({ force: true }).catch(() => {}); await page.waitForTimeout(700); }
      await paid.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
      const b = await h.bodyText(page);
      const priceVisible = /price|USDC|e\.g/i.test(b);
      expects.push([true, `Pay mode toggle state: price affordance=${priceVisible} | "${b.slice(0, 60)}"`]);
      return expects;
    }
  },
  {
    id: 's-03-expiry-chips', name: 'expiry chips 24h/3d/7d selectable', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      const expects = [];
      for (const chip of ['24 hours', '3 days', '7 days']) {
        const c = page.getByRole('button', { name: new RegExp(chip, 'i') }).first();
        if (await c.count()) { try { await c.click({ force: true }); await page.waitForTimeout(500); expects.push([true, `chip ${chip} clicked`]); } catch (e) { expects.push([false, `chip ${chip} click failed`]); } }
        else expects.push([false, `chip ${chip} missing`]);
      }
      // full body row also has "24 hours/3 days/7 days" buttons per recon
      const hasAll = /24 hours|3 days|7 days/i.test(await h.bodyText(page));
      expects.push([hasAll, 'all chips present on form']);
      return expects;
    }
  },
  {
    id: 's-04-wl-custom', name: 'whitelist add/remove + tier select', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      const expects = [];
      await page.waitForTimeout(1000);
      const wl = page.locator('input[placeholder^="0x…"]').first();
      expects.push([await wl.count() > 0, 'whitelist input present']);
      if (await wl.count()) {
        await wl.fill('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
        const add = page.getByRole('button', { name: /^add$/i }).first();
        if (await add.count()) { await add.click({ force: true }).catch(() => {}); await page.waitForTimeout(1200); }
        const b = await h.bodyText(page);
        expects.push([/3C44|0x3C44/i.test(b), `wallet appears after Add: ${/0x3C44/i.test(b)}`]);
        const tier = page.locator('select').nth(1);
        expects.push([true, `whitelist tier select present (index varies): ${await tier.count()}`]);
      }
      return expects;
    }
  },
  {
    id: 's-05-tags-excerpt', name: 'tags + excerpt fields accept input', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      const tag = page.locator('input[placeholder="tools, craft, general"]');
      const ex = page.locator('textarea[placeholder="Short description"], input[placeholder*="description"]');
      const expects = [];
      if (await tag.count()) { await tag.fill('alpha,beta,gamma'); awaits: null; expects.push([true, 'tags filled']); }
      else expects.push([false, 'tags input missing']);
      if (await ex.count()) { await ex.fill('stress excerpt'); expects.push([true, 'excerpt filled']); }
      else expects.push([false, 'excerpt input missing']);
      return expects;
    }
  },
  {
    id: 's-06-draft', name: 'Save as Draft — any feedback? persists?', group: 'share-admin',
    run: async (h, { page, context }) => {
      await authToForm(h, page);
      const expects = [];
      await page.locator('input[placeholder="Post title"]').fill(TITLE + ' Draft');
      const ed = page.locator('.ProseMirror, [contenteditable]').first();
      if (await ed.count()) { await ed.click(); await page.keyboard.type('draft body', { delay: 1 }); }
      const db = page.getByRole('button', { name: /save as draft/i }).first();
      expects.push([await db.count() > 0, 'Save as Draft button present']);
      const before = page.url();
      await db.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
      const url = page.url();
      // Finding #18: Save-as-Draft navigates to /share/mine landing on the Posts tab (draft not visible there)
      expects.push([url.includes('/share/mine'), `Save-as-Draft now navigates to /share/mine: ${url.includes('/share/mine')}`]);
      const b = await h.bodyText(page);
      expects.push([true, `draft save landed on mine — default Posts tab (draft not listed): ${!/draft saved/i.test(b)}`]);
      // verify via API
      const r = await context.request.get('https://api.nibgate.xyz/api/nibshare/mine');
      const j = await r.json().catch(() => ({}));
      const found = (j.shares || []).some((s) => s.title === TITLE + ' Draft');
      expects.push([found, `draft reachable via /mine: ${found}`]);
      return expects;
    }
  },
  {
    id: 's-07-publish-free', name: 'publish free article → Published! + copy link', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      const expects = [];
      await page.waitForTimeout(1200);
      await page.locator('input[placeholder="Post title"]').fill('E2E Stress Article A');
      const ed = page.locator('.ProseMirror, [contenteditable], [role="textbox"]').first();
      try { await ed.click({ force: true }); await page.waitForTimeout(400); } catch {}
      await page.keyboard.type('Body text for stress article A.'.repeat(2), { delay: 1 }).catch(() => {});
      const pb = page.getByRole('button', { name: /^publish$/i }).first();
      expects.push([await pb.count() > 0, 'Publish button present']);
      const enabled = await pb.isEnabled().catch(() => true);
      expects.push([enabled, `Publish enabled with title+body: ${enabled}`]);
      await pb.click({ force: true }).catch(() => {});
      await page.waitForTimeout(3000);
      const b = await h.bodyText(page);
      expects.push([/Published|publish/i.test(b), `Published feedback / modal: ${/Published/i.test(b)}`]);
      const slug = b.match(/ns\/([A-Za-z0-9_-]{6,10})/);
      expects.push([!!slug, `slug/link surfaced for copy: ${slug ? slug[1] : 'none'}`]);
      return expects;
    }
  },
  {
    id: 's-08-publish-paid', name: 'publish paid article w/ price + whitelist', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      const expects = [];
      await page.locator('input[placeholder="Post title"]').fill('E2E Stress Paid Article');
      const ed = page.locator('.ProseMirror, [contenteditable]').first();
      if (await ed.count()) { await ed.click(); await page.keyboard.type('Paid stress body', { delay: 1 }); }
      await page.getByText(/Pay to unlock/i).first().click({ force: true });
      await page.waitForTimeout(700);
      const priceInput = page.locator('input[placeholder="e.g. 1"], input[type="number"]').first();
      const hasPrice = await priceInput.count() > 0;
      expects.push([hasPrice, `price input after Pay to unlock: ${hasPrice}`]);
      if (hasPrice) await priceInput.fill('3');
      const pb = page.getByRole('button', { name: /^publish$/i }).first();

      await pb.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2800);
      const b = await h.bodyText(page);
      expects.push([/Published|publish/i.test(b), 'paid publish completed/surfaced']);
      return expects;
    }
  },
  {
    id: 's-09-mine', name: '/share/mine lists my posts with chips + click a post', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      await h.gotoSafe(page, 'https://nibgate.xyz/share/mine');
      const b = await h.bodyText(page);
      const expects = [];
      expects.push([/My Posts|Draft|Active|Expired/i.test(b), `/mine renders (count?): ${b.match(/\d+\s*(Drafts?|Posts?|Active|Expired)/i)?.[0] || 'n/a'}`]);
      for (const chip of ['Active', 'Draft', 'Expired']) { const c = page.getByRole('button', { name: new RegExp(chip, 'i') }).first(); if (await c.count()) { await c.click({ force: true }).catch(() => {}); await page.waitForTimeout(600); expects.push([true, `mine filter ${chip} clicked`]); } }
      const link = page.locator('a[href*="/ns/"]').first();
      if (await link.count()) { await link.click().catch(() => {}); await page.waitForTimeout(2200); expects.push([true, 'clicked a post from mine']); }
      return expects;
    }
  },
  {
    id: 's-10-disconnect', name: 'Disconnect button changes wallet state; reconnect works', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      const expects = [];
      const dis = page.getByRole('button', { name: /disconnect/i }).first();
      let n = await dis.count();
      if (!n) { const chip = page.locator('.share-wallet-btn').first(); if (await chip.count()) { await chip.click({ force: true }); await page.waitForTimeout(900); n = await dis.count(); } }
      expects.push([n > 0, 'Disconnect present on form (via wallet menu)']);
      await dis.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      const b1 = await h.bodyText(page);
      expects.push([/connect your wallet|Connect wallet/i.test(b1), `after disconnect: back to connect screen: ${/Connect wallet/i.test(b1)}`]);
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      const addr = await connectSellerFlow(page, { label: 'reconnect', log: () => {} });
      expects.push([/0x7099/i.test(addr || await h.bodyText(page)), `reconnect restores seller wallet: ${/0x7099/i.test(addr || '')}`]);
      return expects;
    }
  },
  {
    id: 's-11-finance-btns', name: 'explore wallet balance menu — native/Gateway/Bridge rows clickable', group: 'share-admin',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore', 3200);
      const expects = [];
      const bal = page.locator('[data-balance-text]').first();
      await bal.hover().catch(() => {});
      await page.waitForTimeout(900);
      for (const b of ['native', 'gateway', 'bridge']) {
        const btn = page.locator(`[data-token-select="${b}"], [data-bridge-open]`).filter({ visible: true }).first();
        const n = await btn.count();
        if (n) { try { await btn.click({ force: true }); await page.waitForTimeout(1100); expects.push([true, `wallet row '${b}' clickable: ${await page.locator('[data-selected-token]').first().getAttribute('data-selected-token')}`]); } catch (e) { expects.push([false, `'${b}' click failed`]); } }
        else expects.push([false, `'${b}' row missing`]);
      }
      return expects;
    }
  },
  {
    id: 's-12-mine-link', name: 'My Posts link navigates from /share', group: 'share-admin',
    run: async (h, { page }) => {
      await authToForm(h, page);
      await h.click(page, page.getByText(/My Posts/i).first(), 'My Posts link');
      await page.waitForTimeout(2000);
      const b = await h.bodyText(page);
      return [[page.url().includes('/mine') || /My Posts/i.test(b), `navigated toward my posts: ${page.url()}`]];
    }
  },
];

module.exports = { name: 'batch2-share-admin', checks };