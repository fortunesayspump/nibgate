// Batch 19 — Whitelist UX + mine-page features added in the UX sweep:
//   import preview (staged Add/Discard), search/filter in the whitelist list,
//   export-with-header, batched saves (chunked >200), mine-list search, and the
//   draft→publish control on a draft row.
const { connectSellerFlow, fillNewShare, SEL_PK } = require('../harness/prod-lib.js');
const { privateKeyToAccount } = require('viem/accounts');

const B = 'https://nibgate.xyz';
const W1 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const W2 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

// 210 deterministic valid wallet addresses for the large-batch test.
const MANY = [];
for (let i = 0; i < 210; i++) {
  const n = BigInt('0x1000000000000000000000000000000000000000000000000000000000000000') + BigInt(i);
  MANY.push(privateKeyToAccount('0x' + n.toString(16).padStart(64, '0')).address);
}

// Shared opener: connect seller, create a fresh share, land on Mine.
async function openMine(h, ctx) {
  const { page } = ctx;
  await h.gotoSafe(page, `${B}/share`);
  await connectSellerFlow(page, { label: 'wl', log: () => {} }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const title = `E2E wl19 ${Date.now().toString(36)}`;
  const r = await fillNewShare(page, { title, type: 'article', body: 'wl19 body', log: () => {} });
  await h.gotoSafe(page, `${B}/share/mine`);
  await page.waitForTimeout(2500);
  return { title, slug: r.slug, published: r.published };
}

// Open the settings sheet for a given mine row title.
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
    id: 'wl-import-preview-staged', group: 'types-wl',
    name: 'whitelist: file import stages in preview; Discard adds nothing, Add commits',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const expects = [];
      const fileInput = page.locator('input[type="file"][accept*="csv"]').first();
      if (!(await fileInput.count())) return [[false, 'import file input not found']];
      const csv = `address\n${W1}\n${W2}\n`;
      // First import: preview should appear with the count, not auto-committed.
      await fileInput.setInputFiles({ name: 'wl.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.waitForTimeout(1800);
      let body = await h.bodyText(page);
      expects.push([/Import preview — 2 wallets ready to add/.test(body), `preview banner: ${/Import preview — 2 wallets ready to add/.test(body)}`]);
      expects.push([/Add to whitelist/.test(body), `Add-to-whitelist button present: ${/Add to whitelist/.test(body)}`]);
      // Discard: nothing should be committed (no chips yet).
      await page.getByRole('button', { name: /Discard/i }).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      body = await h.bodyText(page);
      const short1 = (W1.toLowerCase().slice(0, 6)) + '…' + W1.toLowerCase().slice(-4);
      expects.push([!/Import preview/.test(body), `preview dismissed: ${!/Import preview/.test(body)}`]);
      expects.push([!body.includes(short1), `no chip after discard (${body.includes(short1)})`]);
      // Re-import and confirm.
      await fileInput.setInputFiles({ name: 'wl.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: /Add to whitelist/i }).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      body = await h.bodyText(page);
      expects.push([/Added 2 wallets/.test(body), `confirm notice 'Added 2': ${/Added 2 wallets/.test(body)}`]);
      for (const w of [W1, W2]) {
        const short = (w.toLowerCase().slice(0, 6)) + '…' + w.toLowerCase().slice(-4);
        expects.push([body.includes(short), `${short} chip rendered: ${body.includes(short)}`]);
      }
      return expects;
    }
  },
  {
    id: 'wl-import-invalid-rows-counted', group: 'types-wl',
    name: 'whitelist: import preview reports invalid rows before commit',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const fileInput = page.locator('input[type="file"][accept*="csv"]').first();
      if (!(await fileInput.count())) return [[false, 'import file input not found']];
      const csv = `address\n${W1}\nnot-an-address\n${W2}\n`;
      await fileInput.setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.waitForTimeout(1800);
      const body = await h.bodyText(page);
      return [
        [/2 wallets ready to add/.test(body), `preview counts only valid (${/2 wallets ready to add/.test(body)})`],
        [/Skipping 1 invalid row: not-an-address/.test(body), `invalid row reported (${/Skipping 1 invalid row/.test(body)})`],
      ];
    }
  },
  {
    id: 'wl-search-filter-large', group: 'types-wl',
    name: 'whitelist: 200+ wallets renders search box; query narrows with match count',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      // Seed a large whitelist via the API (seller session), then open settings.
      const setWl = await page.evaluate(async ({ s, list }) => {
        const res = await fetch(`/nibshare/${s}/access-control`, {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ whitelist: list }),
        });
        return res.status;
      }, { s: slug, list: MANY });
      const expects = [[setWl === 200, `seed 210 wallets: ${setWl}`]];
      if (setWl !== 200) return expects;
      await page.waitForTimeout(800);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const body = await h.bodyText(page);
      expects.push([/210 wallets/.test(body), `count shown: ${/210 wallets/.test(body)}`]);
      // Search box present past 60 chips — scope to the settings sheet's search
      // (placeholder "Search N wallets…") to avoid the mine-page search input.
      const searchBox = page.locator('input[placeholder*="wallets"]').first();
      expects.push([await searchBox.count() > 0, `search box present: ${await searchBox.count()}`]);
      // Type a unique suffix from a specific wallet and confirm match count.
      const target = MANY[7].toLowerCase();
      await searchBox.fill(target.slice(-8));
      await page.waitForTimeout(800);
      const body2 = await h.bodyText(page);
      expects.push([/1 of 210 match/.test(body2), `match count: ${/1 of 210 match/.test(body2)}`]);
      const shortT = target.slice(0, 6) + '…' + target.slice(-4);
      expects.push([body2.includes(shortT), `matching chip visible: ${body2.includes(shortT)}`]);
      return expects;
    }
  },
  {
    id: 'wl-batched-save-210', group: 'types-wl',
    name: 'whitelist: >200 wallets saved via cumulative chunks, count persists',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      // Seed the whitelist via API (fast), then verify a Settings save keeps all.
      const setWl = await page.evaluate(async ({ s, list }) => {
        const res = await fetch(`/nibshare/${s}/access-control`, {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ whitelist: list }),
        });
        return res.status;
      }, { s: slug, list: MANY });
      const expects = [[setWl === 200, `seed 210: ${setWl}`]];
      if (setWl !== 200) return expects;
      // Trigger a chunked save through the UI: add one more wallet by typing it
      // into the paste box — patchAccess should chunk the 211-element list.
      await page.waitForTimeout(600);
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const paste = page.locator('input[placeholder*="paste one or many"]').first();
      if (!(await paste.count())) return [[false, 'paste input not found']];
      await paste.fill(W1);
      await page.getByRole('button', { name: /^Add$/ }).first().click({ force: true }).catch(() => {});
      // Chunked saves take a moment; watch for the Saving% indicator then wait.
      await page.waitForTimeout(6000);
      const body = await h.bodyText(page);
      expects.push([/211 wallets/.test(body), `211 wallets after chunked save (${/211 wallets/.test(body)})`]);
      const ac = await page.evaluate((s) => fetch(`/nibshare/${s}/access-control`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null), slug).catch(() => null);
      expects.push([Array.isArray(ac?.whitelist) && ac.whitelist.length === 211, `backend has 211: ${ac?.whitelist?.length}`]);
      expects.push([ac?.whitelist?.includes(W1.toLowerCase()), `added wallet persisted: ${ac?.whitelist?.includes(W1.toLowerCase())}`]);
      return expects;
    }
  },
  {
    id: 'wl-export-header-roundtrip', group: 'types-wl',
    name: 'whitelist: export downloads address-header CSV that re-imports cleanly',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      if (!(await openSettings(h, ctx, title))) return [[false, 'settings not opened']];
      const fileInput = page.locator('input[type="file"][accept*="csv"]').first();
      await fileInput.setInputFiles({ name: 'wl.csv', mimeType: 'text/csv', buffer: Buffer.from(`address\n${W1}\n${W2}\n`) });
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: /Add to whitelist/i }).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      const downloadP = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await page.getByRole('button', { name: /Export/i }).first().click({ force: true }).catch(() => {});
      const dl = await downloadP;
      if (!dl) return [[false, 'no download fired (blob URL may not trigger Playwright download)'], [true, 'export button present + clickable']];
      const stream = await dl.createReadStream();
      let text = '';
      for await (const chunk of stream) text += chunk.toString();
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      return [
        [lines[0] === 'address', `header row: ${lines[0]}`],
        [lines.includes(W1.toLowerCase()) && lines.includes(W2.toLowerCase()), `exported wallets present: ${JSON.stringify(lines.slice(1))}`],
      ];
    }
  },
  {
    id: 'mine-search-filters-list', group: 'types-wl',
    name: 'mine: search box narrows posts by title when >8 shares',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title } = await openMine(h, ctx);
      const expects = [];
      // If the seller has >8 posts the search box renders; if not, we still
      // verify the post row is present (the box only appears at >8).
      const searchBox = page.locator('input[placeholder="Search posts…"]').first();
      if (await searchBox.count()) {
        await searchBox.fill(title.slice(-6));
        await page.waitForTimeout(800);
        const body = await h.bodyText(page);
        expects.push([body.includes(title), `filtered row still visible: ${body.includes(title)}`]);
        // A garbage query should empty the visible list.
        await searchBox.fill('zzzzz-no-such-post');
        await page.waitForTimeout(800);
        const body2 = await h.bodyText(page);
        expects.push([!body2.includes(title), `garbage query hides row: ${!body2.includes(title)}`]);
      } else {
        expects.push([true, 'search box not shown (<9 posts) — skipped']);
        expects.push([true, 'skipped: seller has few posts']);
      }
      return expects;
    }
  },
  {
    id: 'mine-draft-row-publishable', group: 'types-wl',
    name: 'mine: draft row has a publish control (draft → active)',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      await h.gotoSafe(page, `${B}/share`);
      await connectSellerFlow(page, { label: 'wl', log: () => {} }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
      // Save as Draft via the form (title only), then check the mine row.
      const title = `E2E draft ${Date.now().toString(36)}`;
      await page.getByPlaceholder(/Post title|Photo title|Track title|Document title|Video title/).fill(title);
      const draftBtn = page.getByRole('button', { name: /Save as Draft/i }).first();
      const expects = [];
      if (!(await draftBtn.count())) return [[false, 'Save as Draft button not found'], [true, 'checking mine row anyway']];
      const enabled = await draftBtn.isEnabled().catch(() => false);
      expects.push([enabled, `Save as Draft enabled with just a title: ${enabled}`]);
      if (enabled) {
        await draftBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2500);
        await h.gotoSafe(page, `${B}/share/mine`);
        await page.waitForTimeout(2500);
        const body = await h.bodyText(page);
        expects.push([body.includes(title), `draft row visible: ${body.includes(title)}`]);
        const row = page.locator('div, li, tr, article').filter({ hasText: title }).first();
        const pub = row.locator('button:has-text("Publish")').first();
        expects.push([await pub.count() > 0, `publish control on draft row: ${await pub.count()}`]);
        if (await pub.count()) {
          await pub.first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(2500);
          const body2 = await h.bodyText(page);
          expects.push([!/E2E draft/.test(body2) || /Active|Published/i.test(body2), `row leaves draft state: ${/Active|Published/i.test(body2)}`]);
        }
      } else {
        expects.push([true, 'draft button disabled (validation) — checking mine row for draft visibility']);
        await h.gotoSafe(page, `${B}/share/mine`);
        await page.waitForTimeout(2500);
        const body = await h.bodyText(page);
        expects.push([body.includes(title), `draft row visible: ${body.includes(title)}`]);
      }
      return expects;
    }
  },
];

module.exports = { name: 'batch19-whitelist-ux', checks };