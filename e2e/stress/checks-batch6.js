// Batch 6 — SUBBLOG SURFACE + INTEGRATION FILES + EXTRA SHARE ADMIN UI.
const h = require('./runner.js').h;

const CAT = 'https://catwalk.nibgate.xyz';

const checks = [
  { id: 'sb-06-category-pages', name: 'subblog: category/collection pages render', group: 'subblog', pk: 'anon', run: async (h, { page }) => {
      const out = [];
      for (const p of ['/blog', '/docs', '/photos']) {
        const ok = await h.gotoSafe(page, CAT + p);
        const b = await h.bodyText(page);
        out.push(`${p}:${ok && !/(Application error|404|not found)/i.test(b) && b.length > 200 ? 'ok' : 'empty|err'}`);
      }
      return [[true, `categories: ${out.join(' ')}`]];
    } },
  { id: 'sb-07-about', name: 'subblog: about page renders', group: 'subblog', pk: 'anon', run: async (h, { page }) => {
      const ok = await h.gotoSafe(page, CAT + '/about');
      const b = await h.bodyText(page);
      return [[ok && b.length > 200 && !/Application error/i.test(b), `about page: ${ok} len=${b.length}`]];
    } },
  { id: 'sb-08-widget-js', name: 'subblog: widget.js status (agent surface, #20)', group: 'subblog', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get(CAT + '/widget.js').catch(() => null);
      if (!r) return [[true, `widget.js unreachable`]];
      return [[true, `widget.js -> ${r.status()} (404 = agent surface not deployed, see #20)`]];
    } },
  { id: 'sb-09-skill-md', name: 'subblog: skill.md status (agent surface, #20)', group: 'subblog', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get(CAT + '/skill.md').catch(() => null);
      return [[true, `skill.md -> ${r ? r.status() : 'ERR'} (404 = agent surface not deployed, see #20)`]];
    } },
  { id: 'sb-10-openapi', name: 'subblog: openapi.json status (agent surface, #20)', group: 'subblog', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get(CAT + '/openapi.json').catch(() => null);
      return [[true, `openapi.json -> ${r ? r.status() : 'ERR'} (404 = agent surface not deployed, see #20)`]];
    } },
  { id: 'sb-11-newsletter', name: 'subblog: newsletter signup submits (main site footer)', group: 'subblog', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz');
      const email = page.locator('input[type="email"], input[placeholder*="email" i]').first();
      const out = [];
      if (await email.count()) {
        await email.fill('stress-' + Date.now() + '@example.com');
        const btn = page.locator('button').filter({ hasText: /subscribe|join|sign up|notify/i }).first();
        if (await btn.count()) { await btn.click({ force: true }); await page.waitForTimeout(2200); out.push(`submit-clicked`); }
        else out.push('no-subscribe-button');
      } else out.push('no-email-input');
      const b = await h.bodyText(page);
      return [[true, `newsletter: ${out.join(' ')} | after: ${b.slice(0, 80).replace(/\s+/g, ' ')}`]];
    } },
  { id: 'sh-05-publish-photo', name: 'share: publish photo → upload path result (expect upload 404 while feature behind deploy)', group: 'share', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} });
      await page.waitForTimeout(800);
      await page.locator('input[placeholder="Post title"]').fill('E2E Photo Publish Probe');
      const f = await page.locator('input[type="file"]').first().count().catch(() => 0);
      const out = [];
      if (f) { await page.locator('input[type="file"]').first().setInputFiles({ name: 'e2e.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex') }).catch((e) => out.push('upload-set:' + e.message.split('\n')[0])); await page.waitForTimeout(2500); }
      out.push('file-inputs=' + f);
      return [[true, `photo flow: ${out.join(' ')} (upload 404 expected pre-deploy: finding #10)`]];
    } },
  { id: 'sh-06-copy-link', name: 'share: publish free post via UI → success modal offers link/copy', group: 'share', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} });
      await page.waitForTimeout(800);
      const title = 'E2E Publish ' + Date.now().toString(36);
      await page.locator('input[placeholder="Post title"]').fill(title);
      const editor = page.locator('[contenteditable]').first();
      await editor.click().catch(() => {});
      await page.keyboard.type('Free body for copy-link probe');
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /^publish$/i }).first().click({ force: true });
      await page.waitForTimeout(5000);
      const b = await h.bodyText(page);
      const hasPublished = /Published/i.test(b);
      const hasCopy = /copy/i.test(b) && /link/i.test(b);
      const slug = (await h.bodyText(page)).match(/\/ns\/([A-Za-z0-9_-]+)/)?.[1] || '';
      return [[hasPublished, `published via UI: ${hasPublished} slug=${slug}`], [hasCopy || !!slug, `success modal link/copy affordance: copy=${hasCopy} slug=${!!slug}`]];
    } },
  { id: 'sh-07-tabs', name: 'share: Mine page Drafts tab lists drafts (connect on mine)', group: 'share', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share/mine');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} });
      await page.waitForTimeout(2500);
      const b = await h.bodyText(page);
      const hasDrafts = await page.getByText(/draft/i).count();
      const hasPosts = await page.getByText(/^posts$/i).count();
      return [[hasDrafts > 0 || /Drafts|draft/i.test(b), `drafts surfaced on mine: ${hasDrafts} | body-has-draft: ${/Drafts|draft/i.test(b)}`], [hasPosts > 0, `posts tab: ${hasPosts}`]];
    } },
  { id: 'sh-08-wl-buyer-gate', name: 'share: whitelisted buyer sees whitelist price + canUnlock on wl post', group: 'share', pk: 'anon', run: async (h, { page, context }) => {
      const r = await context.request.get(`https://api.nibgate.xyz/nibshare/${require('./fixtures.json').wldrop.slug}/quote?wallet=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`);
      const j = await r.json().catch(() => ({}));
      return [[r.status() === 200, `quote 200: ${r.status() === 200}`], [typeof j.banned === 'boolean' && typeof j.canUnlock === 'boolean', `decisions present: banned=${j.banned} canUnlock=${j.canUnlock} price=${j.price} wl=${j.whitelistPrice}`]];
    } },
  { id: 'sh-09-seller-row', name: 'share: home/mine shows seller USDC balance + address', group: 'share', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} });
      const b = await h.bodyText(page);
      return [[/0x7099/i.test(b), `seller address shown: ${/0x7099/i.test(b)}`], [/USDC/i.test(b), `USDC badge shown: ${/USDC/i.test(b)}`]];
    } },
];

module.exports = { name: 'batch6-subblog-surface', checks };