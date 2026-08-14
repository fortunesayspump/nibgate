// Batch 17 — Whitelist bulk-management e2e: header-aware CSV/Excel import via
// the real file input, chip rendering, and ban→whitelist[] strip (frontend
// mirror + backend removal), export/template affordances.
const { connectSellerFlow, fillNewShare, SEL_PK } = require('../harness/prod-lib.js');
const XLSX = require('/Users/fortune/Documents/Workflows/nibgate-repo/frontend/node_modules/xlsx');

const B = 'https://nibgate.xyz';
// Fixture addresses (BUY_PK and friends) — valid 0x wallets to whitelist.
const W1 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const W2 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const W3 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

const CSV = `name,wallet,price
Alice,${W1},5
Bob,${W2},10
Carol,${W3},
`;

// Shared opener: connect seller, create a fresh share, land on Mine.
async function openMine(h, ctx) {
  const { page } = ctx;
  await h.gotoSafe(page, `${B}/share`);
  await connectSellerFlow(page, { label: 'wl', log: () => {} }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const title = `E2E wl ${Date.now().toString(36)}`;
  const r = await fillNewShare(page, { title, type: 'article', body: 'wl import', log: () => {} });
  await h.gotoSafe(page, `${B}/share/mine`);
  await page.waitForTimeout(2500);
  return { title, slug: r.slug, published: r.published };
}

const checks = [
  {
    id: 'wl-import-csv-header-aware', group: 'types-wl',
    name: 'whitelist: header-aware CSV import via file input renders all wallets',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      // Open settings for the freshly created row.
      const row = page.locator('div, li, tr, article').filter({ hasText: title }).first();
      const settings = row.locator('button[title="Settings"]').first();
      if (!(await settings.count())) return [[false, 'settings button missing on mine row']];
      await settings.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      const expects = [];
      // The import file input is hidden; drive it directly.
      const fileInput = page.locator('input[type="file"][accept*="csv"]');
      if (await fileInput.count()) {
        await fileInput.first().setInputFiles({
          name: 'whitelist.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(CSV, 'utf-8'),
        });
        await page.waitForTimeout(1800);
        const body = await h.bodyText(page);
        // All three should render as chips (short addresses) and the notice
        // should report what was added / skipped.
        expects.push([/Added 3/.test(body), `import notice 'Added 3': ${/Added 3/.test(body)}`]);
        for (const w of [W1, W2, W3]) {
          const short = (w.toLowerCase().slice(0, 6)) + '…' + w.toLowerCase().slice(-4);
          expects.push([body.includes(short), `${short} chip visible: ${body.includes(short)}`]);
        }
        // price column header present => price-ignored notice.
        expects.push([/price column ignored|one whitelist tier/i.test(body), `price col noted: ${/price column ignored|one whitelist tier/i.test(body)}`]);
      } else {
        expects.push([false, 'import file input not found']);
      }
      // Export + Template buttons should exist.
      expects.push([/Export/.test(await h.bodyText(page)), 'Export button present']);
      expects.push([/Template/.test(await h.bodyText(page)), 'Template button present']);
      return expects;
    }
  },
  {
    id: 'wl-ban-strips-whitelist', group: 'types-wl',
    name: 'whitelist: banning a whitelisted wallet strips it from whitelist[]',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, slug } = await openMine(h, ctx);
      if (!slug) return [[false, 'no slug']];
      // Set a whitelist via the API (seller session cookie), then ban one.
      const setWl = await page.evaluate(async (s) => {
        const res = await fetch(`/nibshare/${s}/access-control`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ whitelist: ['0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', '0x90f79bf6eb2c4f870365e785982e1f101e93b906'] }),
        });
        return res.status;
      }, slug);
      const banRes = await page.evaluate(({ s, w }) => {
        return fetch(`/nibshare/${s}/entitlements/${w}/ban`, {
          method: 'POST', credentials: 'include',
        }).then((r) => r.status);
      }, { s: slug, w: W1 });
      const expects = [];
      expects.push([setWl === 200, `set whitelist via API: ${setWl}`]);
      expects.push([banRes === 200, `ban API accepted: ${banRes}`]);
      // After ban, access-control whitelist must no longer include W1.
      const ac = await page.evaluate(async (s) => {
        const res = await fetch(`/nibshare/${s}/access-control`, { credentials: 'include' });
        if (!res.ok) return null;
        return res.json();
      }, slug);
      expects.push([ac !== null, `access-control readable: ${ac !== null}`]);
      if (ac) {
        expects.push([!ac.whitelist.includes(W1.toLowerCase()), `W1 stripped from whitelist[]: ${!ac.whitelist.includes(W1.toLowerCase())}`]);
        expects.push([ac.whitelist.includes(W2.toLowerCase()), `W2 still whitelisted: ${ac.whitelist.includes(W2.toLowerCase())}`]);
        const banned = (ac.entitlements || []).find((e) => e.wallet === W1.toLowerCase());
        expects.push([banned && banned.status === 'banned', `W1 has banned entitlement: ${banned && banned.status}`]);
      }
      return expects;
    }
  },
  {
    id: 'wl-import-txt-excel-accept', group: 'types-wl',
    name: 'whitelist: txt and xlsx accepted by file input accept attr',
    pk: SEL_PK,
    run: async (h, ctx) => {
      const { page } = ctx;
      const { title, published } = await openMine(h, ctx);
      if (!published) return [[false, 'share not published']];
      const row = page.locator('div, li, tr, article').filter({ hasText: title }).first();
      const settings = row.locator('button[title="Settings"]').first();
      if (!(await settings.count())) return [[false, 'settings button missing']];
      await settings.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      const accept = await page.locator('input[type="file"]').first().getAttribute('accept').catch(() => '');
      const expects = [
        [/\.csv.*\.txt.*\.xlsx.*\.xls/i.test(accept), `accept includes csv/txt/xlsx/xls: ${accept}`],
      ];
      // Excel import actually parses: xlsx buffer with address header.
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['wallet'], [W1], [W2]]);
      XLSX.utils.book_append_sheet(wb, ws, 'S');
      const xbuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({ name: 'wl.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xbuf });
      await page.waitForTimeout(1800);
      const body = await h.bodyText(page);
      expects.push([/Added 2/.test(body), `xlsx import notice 'Added 2': ${/Added 2/.test(body)}`]);
      return expects;
    }
  },
];

module.exports = { name: 'batch17-whitelist', checks };