const { install, connectSellerFlow, bodyText, BUY_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: BUY_PK });
  await page.goto('https://catwalk.nibgate.xyz/docs/lookbook-materials-d14', { waitUntil: 'commit' });
  await page.waitForTimeout(2500);
  console.log('pre-connect:', (await bodyText(page)).slice(0, 220));
  await connectSellerFlow(page, { label: 'b', log: () => {} });
  await page.waitForTimeout(1500);
  const b = await bodyText(page);
  console.log('post-connect:', b.slice(0, 320));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
