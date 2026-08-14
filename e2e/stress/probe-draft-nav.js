// probe: exact Save-as-Draft navigation target + resulting status
const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');
const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/stress-draft-nav.log';
function log(s) { const line = `${new Date().toISOString()} ${s}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); }

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  page.on('response', async (r) => { if (r.url().includes('/api/nibshare') && r.request().method() === 'POST') log(`POST ${r.url()} -> ${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`); });
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit' });
  await page.waitForTimeout(2500);
  await connectSellerFlow(page, { label: 's', log: () => {} });
  await page.waitForTimeout(1000);
  await page.locator('input[placeholder="Post title"]').fill('E2E Stress DraftNav Probe');
  const ed = page.locator('.ProseMirror, [contenteditable]').first();
  if (await ed.count()) { await ed.click(); await page.keyboard.type('nav probe body', { delay: 1 }); }
  const db = page.getByRole('button', { name: /save as draft/i }).first();
  log(`save-as-draft present=${await db.count()} url-before=${page.url()}`);
  await db.click({ force: true });
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(1000); log(`t+${i + 1}s url=${page.url()}`); }
  const b = await bodyText(page);
  log(`FINAL body head: ${b.slice(0, 220).replace(/\n/g, ' ')}`);
  await browser.close();
})().catch((e) => { console.error('PROBE FAIL', e); process.exit(1); });