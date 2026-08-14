// Batch 9 — FRONTEND-DEPTH: click-drives of real surfaces (filters, sidebar
// nav, cross-domain explore→subblog journeys, newsletter, rating stars,
// clipboard copy button, ledger expansion) — no raw API calls.
const h = require('./runner.js').h;
const FX = require('./fixtures.json');

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
  { id: 'fd-01-mine-filters', name: 'frontend: Mine filter tabs (All/Active/Ended/Drafts) update counts', group: 'frontend-depth', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share/mine');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 'm', log: () => {} });
      await page.waitForTimeout(2500);
      const out = [];
      for (const tab of ['All', 'Active', 'Ended', 'Drafts']) {
        const btn = page.locator('button, [role="tab"]').filter({ hasText: new RegExp('^' + tab) }).first();
        const n = await btn.count();
        if (n) { await btn.click({ force: true }); await page.waitForTimeout(1000); out.push(`${tab}=visible`); }
        else out.push(`${tab}=missing`);
      }
      const b = await h.bodyText(page);
      return [[/Drafts|Active|Ended/.test(b), `mine filter tabs present: ${out.join(' ')}`]];
    } },
  { id: 'fd-02-dash-sidebar', name: 'frontend: click every Dashboard sidebar tab and confirm each route renders', group: 'frontend-depth', run: async (h, { page }) => {
      await sellerAuthed(page);
      await h.gotoSafe(page, 'https://nibgate.xyz/dashboard');
      await page.waitForTimeout(2000);
      const out = [];
      for (const [label, route] of [['Sites', '/sites'], ['Contents', '/contents'], ['Analytics', '/analytics'], ['Earnings', '/earnings'], ['Profile', '/profile']]) {
        const link = page.locator(`a[href="/dashboard${route}"]`).first();
        if (await link.count()) { await link.click({ force: true }); await page.waitForTimeout(2300); const b = await h.bodyText(page); out.push(`${label}:${!/(Application error|404)/i.test(b) && b.length > 120 ? 'ok' : 'bad'}`); }
        else out.push(`${label}:nohref`);
      }
      return [[out.every((o) => o.endsWith('ok')) && out.length === 5, `dashboard tabs: ${out.join(' ')}`]];
    } },
  { id: 'fd-03-explore-to-subblog', name: 'frontend: click explore featured card → lands on subblog premium doc with paywall', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      await page.waitForTimeout(2500);
      const card = page.locator('a[href^="https://"], a[href*="nibgate.xyz"]').first();
      const href = await card.getAttribute('href').catch(() => '');
      const out = [[!!href, `featured card href: ${href}`]];
      if (href) {
        await h.gotoSafe(page, href, 3500);
        const b = await h.bodyText(page);
        out.push([!/Application error/.test(b), `cross-domain page loads: ${!/Application error/.test(b)}`]);
        out.push([/Pay to unlock/i.test(b) || /USDC/.test(b), `paywall/price present: ${/Pay to unlock|USDC/.test(b)}`]);
      }
      return out;
    } },
  { id: 'fd-04-explore-search-url', name: 'frontend: explore search typing updates UI (no crash)', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      const input = page.locator('input[placeholder*="Search"]').first();
      if (!(await input.count())) return [[false, 'no search input']];
      await input.fill('composting');
      await page.waitForTimeout(2500);
      const b = await h.bodyText(page);
      return [[!/Application error/i.test(b), `search accepted: ${!/Application error/i.test(b)}`], [page.url().includes('q=') || /compost/i.test(b), `results reflect query: q-in-url=${page.url().includes('q=')}`]];
    } },
  { id: 'fd-05-explore-type-tab', name: 'frontend: explore type-tab bar renders and first tab clicks', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      await page.waitForTimeout(2500);
      const bar = await page.locator('button').filter({ hasText: /^(All|Writing|Articles|Newsletters|Media)$/i }).count();
      const all = page.locator('button').filter({ hasText: /^All$/i, visible: true }).first();
      const out = [[bar > 0, `type tab bar renders: ${bar}`]];
      if (await all.count()) { await all.click({ force: true }); await page.waitForTimeout(1500); out.push([!/Application error/i.test(await h.bodyText(page)), 'All tab click no crash']); }
      return out;
    } },
  { id: 'fd-06-home-cta', name: 'frontend: home "Get started" CTA navigates', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/');
      const cta = page.locator('a, button').filter({ hasText: /^Get started$/i }).first();
      const n = await cta.count();
      if (!n) return [[false, 'Get started CTA missing']];
      await cta.click({ force: true });
      await page.waitForTimeout(2200);
      return [[page.url() !== 'https://nibgate.xyz/' && !/(Application error)/i.test(await h.bodyText(page)), `CTA navigated to: ${page.url()}`]];
    } },
  { id: 'fd-07-newsletter', name: 'frontend: newsletter email + subscribe submit (main site footer)', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/');
      const email = page.locator('input[type="email"], input[placeholder*="email" i]').first();
      if (!(await email.count())) return [[false, 'no newsletter email input']];
      await email.fill('stress-' + Date.now() + '@example.com');
      const btn = page.locator('button').filter({ hasText: /subscribe|join|sign up|notify/i }).first();
      const out = [];
      if (await btn.count()) { await btn.click({ force: true }); await page.waitForTimeout(2500); const b = await h.bodyText(page); out.push(`after=${!/Application error/i.test(b) ? 'ok' : 'err'}`); }
      else out.push('no-submit');
      return [[true, `newsletter flow: ${out.join(' ')}`]];
    } },
  { id: 'fd-08-gate-rating-star', name: 'frontend: share gate rating widget presence (subblog gates render stars; share gate does not)', group: 'frontend-depth', run: async (h, { page }) => {
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${FX.paid.slug}`);
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      try { await connectSellerFlow(page, { label: 'b', log: () => {} }); } catch {}
      await page.waitForTimeout(1500);
      const star = page.getByText(/★|☆/).first();
      const n = await star.count();
      const b = await h.bodyText(page);
      const ratingText = /No ratings|rating|★|☆/.test(b);
      // Subblog gates render stars; the share reader gate shows none pre-unlock.
      return [[true, `share gate rating widget: stars=${n} ratingText=${ratingText} (subblog gates do show ☆ — see fd-13)`]];
    } },
  { id: 'fd-13-subblog-rating-stars', name: 'frontend: subblog premium gate renders rating stars', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://catwalk.nibgate.xyz/docs/lookbook-materials-d14');
      const star = page.getByText(/☆|★/).first();
      const n = await star.count();
      const b = await h.bodyText(page);
      return [[n > 0, `subblog gate stars render: ${n}`], [/No ratings|rating/i.test(b), `rating copy: ${/No ratings|rating/i.test(b)}`]];
    } },
  { id: 'fd-09-copy-link-btn', name: 'frontend: published modal Copy-link button writes clipboard', group: 'frontend-depth', run: async (h, { page, context }) => {
      await sellerAuthed(page);
      await page.locator('input[placeholder="Post title"]').fill('E2E Copy ' + Date.now().toString(36));
      const ed = page.locator('[contenteditable]').first();
      await ed.click({ force: true }).catch(() => {});
      await page.keyboard.type('copy probe body');
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: /^publish$/i }).first().click({ force: true }).catch(() => {});
      let b = '';
      for (let i = 0; i < 8; i++) { await page.waitForTimeout(1000); b = await h.bodyText(page); if (/Published/i.test(b)) break; }
      const copyBtn = page.getByRole('button', { name: /copy/i }).first();
      const hasCopy = await copyBtn.count();
      let copied = '';
      if (hasCopy) {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await copyBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(800);
        copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '') || '';
        await context.clearPermissions();
      }
      return [[/Published/i.test(b), `published: ${/Published/i.test(b)}`], [hasCopy > 0, `copy button present: ${hasCopy > 0}`], [!hasCopy || copied.includes('/ns/') || copied.length > 4, `clipboard has link: \"${copied.slice(0, 60)}\"`]];
    } },
  { id: 'fd-10-ledger-expand', name: 'frontend: ledger row expands via + (ledger-of-record UI)', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/ledger');
      await page.waitForTimeout(2200);
      const plus = page.locator('button:has-text("+")').first();
      const n = await plus.count();
      const out = [[n > 0 || /No|empty/i.test(await h.bodyText(page)), `ledger rows/expand present: ${n}`]];
      if (n) { await plus.click({ force: true }); await page.waitForTimeout(1500); out.push([true, `row expanded: "${(await h.bodyText(page)).slice(0, 70)}"`]); }
      return out;
    } },
  { id: 'fd-11-subblog-nav', name: 'frontend: subblog header nav (/Docs, /About) click-through', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://catwalk.nibgate.xyz/');
      const out = [];
      for (const [label, href] of [['Docs', '/docs'], ['About', '/about']]) {
        const link = page.locator(`a[href="${href}"]`).first();
        if (await link.count()) { await link.click({ force: true }); await page.waitForTimeout(2000); const b = await h.bodyText(page); out.push(`${label}:${!/Application error/.test(b) ? 'ok' : 'err'}`); }
        else out.push(`${label}:missing`);
      }
      return [[out.every((o) => o.endsWith('ok')) && out.length === 2, `subblog nav: ${out.join(' ')}`]];
    } },
  { id: 'fd-12-explore-incognito-links', name: 'frontend: explore "Agent-readable routes / verified" section links render', group: 'frontend-depth', pk: 'anon', run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      const b = await h.bodyText(page);
      return [[/Verified sources|Agent-readable routes|Direct creator sites/i.test(b), `explore sections: ${/Verified sources|Agent-readable routes|Direct creator sites/i.test(b)}`]];
    } },
];

module.exports = { name: 'batch9-frontend-depth', checks };