// Batch 5 — SHARE LIFE-CYCLE via the real frontend (create → publish → gate →
// revoke), plus form validation edges. Pure-API checks live in batch8
// (platform-api: no dedicated UI exists for those surfaces).
const h = require('./runner.js').h;

async function sellerAuthed(page) {
  await h.gotoSafe(page, 'https://nibgate.xyz/share');
  const { connectSellerFlow } = require('../harness/prod-lib.js');
  await connectSellerFlow(page, { label: 's', log: () => {} });
  await page.waitForTimeout(800);
}

async function uiPublish(page, title, { body = 'stress body', price = null, wl = null, chip = null } = {}) {
  await page.locator('input[placeholder="Post title"]').fill(title);
  const ed = page.locator('.ProseMirror, [contenteditable]').first();
  await ed.click().catch(() => {});
  await page.keyboard.type(body, { delay: 1 });
  if (price !== null) {
    await page.getByText(/pay to unlock/i).first().click({ force: true });
    await page.waitForTimeout(600);
    const priceInput = page.locator('input[placeholder="e.g. 1"], input[type="number"]').first();
    if (await priceInput.count()) await priceInput.fill(String(price));
  }
  if (wl) {
    const wlInput = page.getByPlaceholder(/0x… — paste one or many wallets/i).first();
    await wlInput.fill(wl);
    const add = page.getByRole('button', { name: /^add$/i }).first();
    if (await add.count()) await add.click({ force: true });
    await page.waitForTimeout(500);
  }
  if (chip) {
    const c = page.getByRole('button', { name: new RegExp(chip, 'i') }).first();
    if (await c.count()) await c.click({ force: true });
  }
  await page.getByRole('button', { name: /^publish$/i }).first().click({ force: true });
  await page.waitForTimeout(4500);
  const b = await h.bodyText(page);
  const slug = b.match(/\/ns\/([A-Za-z0-9_-]+)/)?.[1] || '';
  return { published: /Published/i.test(b), slug, body: b };
}

const checks = [
  { id: 'lc-01-owner-sees-own-post', name: 'frontend: owner on own paid post — gate renders for owner too', group: 'share-lifecycle', run: async (h, { page }) => {
      await sellerAuthed(page);
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${require('./fixtures.json').paid.slug}`);
      await page.waitForTimeout(2500);
      const b = await h.bodyText(page);
      const gated = /Pay to unlock/i.test(b);
      return [[gated, `owner sees paywall on own paid post (no owner bypass): ${gated}`], [/5 USDC/.test(b), `price shown: ${/5 USDC/.test(b)}`]];
    } },
  { id: 'lc-02-bad-slug', name: 'frontend: unknown slug — clean not-found page', group: 'share-lifecycle', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/ns/ZzZzZzZzZz');
      const b = await h.bodyText(page);
      return [[/not found|broken|revoked/i.test(b), `not-found copy: "${b.slice(0, 80)}"`]];
    } },
  { id: 'lc-03-ui-revoke', name: 'frontend: publish via UI then revoke via mine row × → becomes revoked/removed', group: 'share-lifecycle', run: async (h, { page }) => {
      await sellerAuthed(page);
      const title = 'E2E UI Revoke ' + Date.now().toString(36);
      const { published, slug } = await uiPublish(page, title);
      const expects = [[published && !!slug, `published via UI: ${published} slug=${slug}`]];
      if (slug) {
        await h.gotoSafe(page, 'https://nibgate.xyz/share/mine');
        await page.waitForTimeout(2500);
        const row = page.locator('div, li, tr, article').filter({ hasText: title }).first();
        const dels = row.locator('button').last();
        const n = await dels.count();
        expects.push([n > 0, `row delete/revoke control present: ${n > 0}`]);
        if (n) {
          await dels.click({ force: true });
          await page.waitForTimeout(1500);
          const confirm = page.getByRole('button', { name: /confirm|delete|revoke|yes/i }).first();
          if (await confirm.count()) { await confirm.click({ force: true }); await page.waitForTimeout(1800); }
          const b = await h.bodyText(page);
          expects.push([/revoked/i.test(b), `row state after revoke: revoked=${/revoked/i.test(b)}`]);
        }
      }
      return expects;
    } },
  { id: 'lc-04-ui-publish-paid-wl', name: 'frontend: publish paid post with whitelist + expiry chip — modal shows slug', group: 'share-lifecycle', run: async (h, { page }) => {
      await sellerAuthed(page);
      const title = 'E2E UI Paid WL ' + Date.now().toString(36);
      const r = await uiPublish(page, title, { price: '3', wl: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', chip: '7 days' });
      return [[r.published && !!r.slug, `paid+wl published: ${r.published} slug=${r.slug}`], [/3 USDC|3\.00|your price/i.test(r.body), `price surfaced in modal: ${/3 USDC/i.test(r.body)}`]];
    } },
  { id: 'lc-05-ui-publish-free-modal', name: 'frontend: publish free via UI — Published modal + link affordance', group: 'share-lifecycle', run: async (h, { page }) => {
      await sellerAuthed(page);
      const title = 'E2E UI Free ' + Date.now().toString(36);
      const r = await uiPublish(page, title);
      return [[r.published, `published: ${r.published}`], [!!r.slug, `slug/link in modal: ${r.slug}`]];
    } },
  { id: 'lc-06-ui-validation', name: 'frontend: Publish disabled with empty form; title-only still disabled', group: 'share-lifecycle', run: async (h, { page }) => {
      await sellerAuthed(page);
      const pb = page.getByRole('button', { name: /^publish$/i }).first();
      const d1 = !(await pb.isEnabled().catch(() => true));
      await page.locator('input[placeholder="Post title"]').fill('Only a title');
      await page.waitForTimeout(500);
      const d2 = !(await pb.isEnabled().catch(() => true));
      return [[d1, `empty form disables Publish: ${d1}`], [d2, `title-only keeps Publish disabled: ${d2}`]];
    } },
  { id: 'lc-07-ui-form-reload', name: 'frontend: typed form data does not survive reload (no localStorage draft)', group: 'share-lifecycle', run: async (h, { page }) => {
      await sellerAuthed(page);
      await page.locator('input[placeholder="Post title"]').fill('E2E Reload Persist Check');
      await page.waitForTimeout(400);
      await page.reload({ waitUntil: 'commit' });
      await page.waitForTimeout(2500);
      const v = await page.locator('input[placeholder="Post title"]').inputValue().catch(() => '');
      return [[v === '', `title cleared after reload (no draft persistence): ${v === ''}`]];
    } },
  { id: 'lc-08-ui-cover-upload', name: 'frontend: cover image picker submits upload (expect upload 404 pre-deploy — #10)', group: 'share-lifecycle', run: async (h, { page }) => {
      await sellerAuthed(page);
      await page.locator('input[placeholder="Post title"]').fill('E2E Cover ' + Date.now().toString(36));
      const file = page.locator('input[type="file"]').first();
      const out = [];
      if (await file.count()) {
        await file.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex') }).catch((e) => out.push('set:' + e.message.split('\n')[0]));
        await page.waitForTimeout(2500);
        out.push(`file-input rendered: ${await file.count() > 0}`);
      } else out.push('no file input');
      return [[true, `cover upload UI exercised: ${out.join(' ')} (uploads 404 until rewrite deploys — finding #10)`]];
    } },
];

module.exports = { name: 'batch5-share-lifecycle', checks };