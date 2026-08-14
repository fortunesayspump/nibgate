const { install, connectSellerFlow, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 's', log: () => {} });
  await page.goto('https://nibgate.xyz/dashboard/sites', { waitUntil: 'commit' });
  await page.waitForTimeout(3500);
  const ins = await page.locator('input').evaluateAll((els) => els.map((e) => ({ ph: e.placeholder, tp: e.type, val: e.value })));
  const btns = await page.locator('button').evaluateAll((els) => els.map((e) => e.innerText.trim().slice(0, 30)).filter(Boolean));
  console.log('inputs:', JSON.stringify(ins, null, 1));
  console.log('buttons:', JSON.stringify(btns));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
