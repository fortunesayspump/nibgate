// probe: dashboard/sites form + earnings endpoints (seller SIWE)
const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit' });
  await page.waitForTimeout(2500);
  await connectSellerFlow(page, { label: 's', log: () => {} });
  await page.waitForTimeout(1000);

  const api = ctx.request;
  for (const ep of ['/api/hub/dashboard/profile', '/api/hub/dashboard/content', '/api/hub/dashboard/analytics', '/api/hub/dashboard/earnings?from=2026-01-01&to=2027-01-01', '/api/hub/dashboard/publishers', '/api/hub/sites']) {
    try { const r = await api.get('https://api.nibgate.xyz' + ep); console.log(`${ep} -> ${r.status()} ${(await r.text()).slice(0, 160)}`); } catch (e) { console.log(`${ep} -> ERR ${e.message.slice(0, 60)}`); }
  }
  await page.goto('https://nibgate.xyz/dashboard/sites', { waitUntil: 'commit' });
  await page.waitForTimeout(3000);
  console.log('\n/sites body:', (await bodyText(page)).slice(0, 700).replace(/\n+/g, ' | '));
  const inputs = await page.locator('input, textarea').evaluateAll((els) => els.map((e) => ({ ph: e.placeholder || '', typ: e.type, val: e.value })));
  console.log('inputs:', JSON.stringify(inputs).slice(0, 500));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });