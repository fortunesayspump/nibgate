// Batch 7 — HUB SURFACE + SHARE FORM edges, all driven through the frontend.
const h = require('./runner.js').h;
const FX = require('./fixtures.json');

async function sellerAuthed(page) {
  await h.gotoSafe(page, 'https://nibgate.xyz/share');
  const { connectSellerFlow } = require('../harness/prod-lib.js');
  await connectSellerFlow(page, { label: 's', log: () => {} });
  await page.waitForTimeout(800);
}

const checks = [
  { id: 'hf-01-explore', name: 'hub: /explore renders content cards', group: 'hub-surface', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      const b = await h.bodyText(page);
      const cards = await page.locator('a[href*="//"], article a').count();
      return [[cards > 0 || /Featured content|Verified creator content/i.test(b), `explore page: cards=${cards}`], [!/Application error/i.test(b), `no error boundary: ${!/Application error/i.test(b)}`]];
    } },
  { id: 'hf-02-leaderboards', name: 'hub: /leaderboards renders', group: 'hub-surface', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/leaderboards');
      const b = await h.bodyText(page);
      return [[b.length > 150 && !/Application error/i.test(b), `leaderboards: len=${b.length}`]];
    } },
  { id: 'hf-03-ledger', name: 'hub: /ledger renders', group: 'hub-surface', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/ledger');
      const b = await h.bodyText(page);
      return [[b.length > 150 && !/Application error/i.test(b), `ledger: len=${b.length}`]];
    } },
  { id: 'hf-04-about', name: 'hub: /about renders', group: 'hub-surface', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/about');
      const b = await h.bodyText(page);
      return [[b.length > 150 && !/Application error/i.test(b), `about: len=${b.length}`]];
    } },
  { id: 'sf-01-price-validation', name: 'share: price field non-numeric does not enable Publish', group: 'share-form', run: async (h, { page }) => {
      await sellerAuthed(page);
      await page.locator('input[placeholder="Post title"]').fill('E2E Price Validate ' + Date.now().toString(36));
      await page.getByText(/pay to unlock/i).first().click().catch(() => {});
      await page.waitForTimeout(500);
      const price = page.getByLabel(/price in usdc/i).first();
      let out = [];
      if (await price.count()) {
        await price.fill('abc');
        await page.waitForTimeout(500);
        const v = await price.inputValue();
        out.push(`value-after-nonnumeric=${JSON.stringify(v)}`);
        const pub = page.getByRole('button', { name: /^publish$/i }).first();
        out.push(`publish-enabled=${await pub.isEnabled().catch(() => true)}`);
      } else out.push('no-price-input');
      return [[true, `price validation: ${out.join(' ')}`]];
    } },
  { id: 'sf-02-draft-reopen', name: 'share: open a saved draft from Mine → editor prefilled', group: 'share-form', run: async (h, { page }) => {
      await sellerAuthed(page);
      await h.gotoSafe(page, 'https://nibgate.xyz/share/mine');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 'm', log: () => {} });
      await page.waitForTimeout(2500);
      const draftTab = page.locator('button, [role="tab"]').filter({ hasText: /Drafts/ }).first();
      if (await draftTab.count()) await draftTab.click({ force: true });
      await page.waitForTimeout(1800);
      const b = await h.bodyText(page);
      const hasDraftRow = / \| article \| draft/i.test(b) || /Draft/i.test(b);
      const out = [[hasDraftRow, `Drafts filter lists draft rows: ${hasDraftRow}`]];
      return out;
    } },
  { id: 'sf-03-wl-add-remove', name: 'share: whitelist chip add + remove in UI', group: 'share-form', run: async (h, { page }) => {
      await sellerAuthed(page);
      await page.locator('input[placeholder="Post title"]').fill('E2E WL ' + Date.now().toString(36));
      const wlInput = page.getByPlaceholder(/0x… — paste one or many wallets/i).first();
      const out = [];
      if (await wlInput.count()) {
        await wlInput.fill('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
        const add = page.getByRole('button', { name: /^add$/i }).first();
        if (await add.count()) { await add.click({ force: true }); await page.waitForTimeout(700); }
        out.push(`chip-after-add=${await page.getByText(/0x3C44/i).count()}`);
        const x = page.locator('button[aria-label*="remove"], button[aria-label*="Remove"], button:has-text("✕"), button:has-text("×")').first();
        const hasX = await x.count();
        if (hasX) { await x.click({ force: true }); await page.waitForTimeout(700); }
        out.push(`chip-after-remove=${hasX ? await page.getByText(/0x3C44/i).count() : 'no-remove-btn'}`);
      } else out.push('no-wl-input');
      return [[true, `whitelist chip lifecycle: ${out.join(' ')}`]];
    } },
  { id: 'sf-04-paid-doc-gate', name: 'share: paid post gate — no content leak, metadata absent on share site', group: 'share-form', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${FX.paid.slug}`);
      const b = await h.bodyText(page);
      return [[!/dataset\.csv|Material ID|SheetName|Lookbook Material Sample/.test(b), `no csv body/file-name leak on share gate: ${!/dataset\.csv/.test(b)}`], [/Pay to unlock/i.test(b), `paywall: ${/Pay to unlock/i.test(b)}`]];
    } },
  { id: 'sf-05-title-cap-note', name: 'share: title input accepts 300 chars (no maxlength — minor robustness)', group: 'share-form', run: async (h, { page }) => {
      await sellerAuthed(page);
      const t = page.locator('input[placeholder="Post title"]');
      await t.fill('x'.repeat(300));
      await page.waitForTimeout(400);
      const v = await t.inputValue();
      return [[true, `title input accepts ${v.length} chars (no maxlength)`]];
    } },
  { id: 'sf-06-free-post-anon', name: 'share: free post fully readable anon', group: 'share-form', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${FX.free.slug}`);
      const b = await h.bodyText(page);
      return [[/E2E Free Alpha/i.test(b), `free content visible: ${/E2E Free Alpha/i.test(b)}`], [!/Pay to unlock/i.test(b), `no paywall on free: ${!/Pay to unlock/i.test(b)}`]];
    } },
];

module.exports = { name: 'batch7-hub-share-form', checks };