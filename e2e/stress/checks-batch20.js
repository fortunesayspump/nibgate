// Batch 20 — Settings-sheet interactions: whitelist-tier toggles (Public price /
// Free / Custom), the invite-only toggle, and viewer/entitlement state after a
// whitelisted buyer views a share.
const { connectSellerFlow, fillNewShare, install, SEL_PK, BUY_PK } = require('../harness/prod-lib.js');

const B = 'https://nibgate.xyz';
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

async function openMine(h, ctx) {
  const { page } = ctx;
  await h.gotoSafe(page, `${B}/share`);
  await connectSellerFlow(page, { label: 's20', log: () => {} }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const title = `E2E s20 ${Date.now().toString(36)}`;
  const r = await fillNewShare(page, { title, type: 'article', body: 's20 body', log: () => {} });
  await h.gotoSafe(page, `${B}/share/mine`);
  await page.waitForTimeout(2500);
  return { title, slug: r.slug, published: r.published };
}

async function openSettings(h, ctx, title) {
  const { page } = ctx;
  const row = page.locator('div, li, tr, article').filter({ hasText: title }).first();
  const settings = row.locator('button[title="Settings"]').first();
  if (!(await settings.count())) return false;
  await settings.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1800);
  return true;
}

const checks = [
  {
    id: 'ss-tier-free-toggle', group: 'types-settings',
    name: 'settings: whitelist tier Free toggle persists wlPrice=0 (buyer sees free)',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      // Seed one whitelisted wallet via API.
      const setWl = await page.evaluate(({ s, w }) => fetch(`/nibshare/${s}/access-control`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whitelist: [w] }) }).then((r) => r.status), { s: slug, w: BUY });
      const expects = [[setWl === 200, `seed whitelist: ${setWl}`]];
      if (setWl !== 200) return expects;
      await page.waitForTimeout(600);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      // Toggle the "Free" tier button.
      const freeBtn = page.getByRole('button', { name: /^Free$/ }).first();
      if (!(await freeBtn.count())) return [[false, 'Free tier button not found']];
      await freeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
      const body = await h.bodyText(page);
      expects.push([/Whitelisted wallets get access free/i.test(body), `free-tier note shown (${/Whitelisted wallets get access free/i.test(body)})`]);
      const ac = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null), slug).catch(() => null);
      expects.push([ac?.whitelistPrice === '0', `backend wlPrice=0 (${ac?.whitelistPrice})`]);
      return expects;
    }
  },
  {
    id: 'ss-tier-custom-toggle', group: 'types-settings',
    name: 'settings: whitelist tier Custom $2 persists (buyer sees discount)',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      const setWl = await page.evaluate(({ s, w }) => fetch(`/nibshare/${s}/access-control`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whitelist: [w] }) }).then((r) => r.status), { s: slug, w: BUY });
      const expects = [[setWl === 200, `seed whitelist: ${setWl}`]];
      if (setWl !== 200) return expects;
      await page.waitForTimeout(600);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const customBtn = page.getByRole('button', { name: /^Custom$/ }).first();
      if (!(await customBtn.count())) return [[false, 'Custom tier button not found']];
      await customBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      const priceInput = page.locator('input[placeholder="0.00"]').first();
      if (!(await priceInput.count())) return [[false, 'custom price input not found']];
      await priceInput.fill('2');
      await page.getByRole('button', { name: /^Save$/ }).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
      const ac = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null), slug).catch(() => null);
      expects.push([ac?.whitelistPrice === '2', `backend wlPrice=2 (${ac?.whitelistPrice})`]);
      const body = await h.bodyText(page);
      expects.push([/Whitelisted wallets pay 2\.00 USDC/i.test(body), `custom-tier note (${/Whitelisted wallets pay 2\.00 USDC/i.test(body)})`]);
      return expects;
    }
  },
  {
    id: 'ss-tier-public-reset', group: 'types-settings',
    name: 'settings: tier reset to Public price clears wlPrice',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      // Seed a $2 custom tier, then reset to public.
      const setTier = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whitelist: ['0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'], whitelistPrice: '2' }) }).then((r) => r.status), slug);
      const expects = [[setTier === 200, `seed $2 tier: ${setTier}`]];
      if (setTier !== 200) return expects;
      await page.waitForTimeout(600);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const pubBtn = page.getByRole('button', { name: /^Public price$/ }).first();
      if (!(await pubBtn.count())) return [[false, 'Public price button not found']];
      await pubBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
      const ac = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null), slug).catch(() => null);
      expects.push([ac?.whitelistPrice == null || ac?.whitelistPrice === '', `backend wlPrice cleared (${ac?.whitelistPrice})`]);
      const body = await h.bodyText(page);
      expects.push([/Whitelisted wallets pay the same as everyone else/i.test(body), `public-tier note (${/Whitelisted wallets pay the same as everyone else/i.test(body)})`]);
      return expects;
    }
  },
  {
    id: 'ss-invite-toggle-persists', group: 'types-settings',
    name: 'settings: invite-only toggle persists publicAccess=false',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      const setWl = await page.evaluate(({ s, w }) => fetch(`/nibshare/${s}/access-control`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whitelist: [w] }) }).then((r) => r.status), { s: slug, w: BUY });
      const expects = [[setWl === 200, `seed whitelist: ${setWl}`]];
      if (setWl !== 200) return expects;
      await page.waitForTimeout(600);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const inviteBtn = page.getByRole('button', { name: /Invite only/i }).first();
      if (!(await inviteBtn.count())) return [[false, 'Invite only button not found']];
      await inviteBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
      const ac = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null), slug).catch(() => null);
      expects.push([ac?.publicAccess === false, `backend publicAccess=false (${ac?.publicAccess})`]);
      const body = await h.bodyText(page);
      expects.push([/Invite-only: only whitelisted wallets can unlock/i.test(body), `invite-only note (${/Invite-only: only whitelisted wallets can unlock/i.test(body)})`]);
      // Flip back open (confirms a dialog).
      const anyoneBtn = page.getByRole('button', { name: /Anyone with the link/i }).first();
      if (await anyoneBtn.count()) {
        page.once('dialog', (d) => d.accept().catch(() => {}));
        await anyoneBtn.click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(2000);
      const ac2 = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null), slug).catch(() => null);
      expects.push([ac2?.publicAccess === true, `reopened publicAccess=true (${ac2?.publicAccess})`]);
      return expects;
    }
  },
  {
    id: 'ss-viewer-tracked-after-buyer-view', group: 'types-settings',
    name: 'settings: whitelisted buyer view is tracked in Seen-by list',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page, context } = ctx;
      const { title, slug, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      const setWl = await page.evaluate(({ s, w }) => fetch(`/nibshare/${s}/access-control`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whitelist: [w] }) }).then((r) => r.status), { s: slug, w: BUY });
      const expects = [[setWl === 200, `seed whitelist: ${setWl}`]];
      if (setWl !== 200) return expects;
      // Buyer opens the share page with the BUY wallet installed.
      const page2 = await context.newPage();
      await install({ page: page2, pk: BUY_PK });
      await h.gotoSafe(page2, `${B}/ns/${slug}`);
      await connectSellerFlow(page2, { label: 'buy', log: () => {} }).catch(() => {});
      await page2.waitForTimeout(2500);
      await page2.close().catch(() => {});
      await page.waitForTimeout(1200);
      // Owner opens settings; the buyer wallet should appear under Seen by.
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const body = await h.bodyText(page);
      const shortBuy = '0x3c44…93bc';
      expects.push([body.includes(shortBuy), `buyer in Seen-by list (${body.includes(shortBuy)})`]);
      expects.push([/view|Seen by/i.test(body), `Seen-by section present`]);
      return expects;
    }
  },
];

module.exports = { name: 'batch20-settings-interactions', checks };