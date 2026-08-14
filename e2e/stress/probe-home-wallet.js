const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/', { waitUntil: 'commit' });
  await page.waitForTimeout(2500);
  await connectSellerFlow(page, { label: 's', log: () => {} });
  await page.waitForTimeout(800);
  let b = await bodyText(page);
  console.log('home after connect:', b.slice(0, 300).replace(/\n+/g, ' | '));
  const addr = page.getByText(/0x7099/i).first();
  const n = await addr.count();
  console.log('addr chip count:', n);
  if (n) { await addr.click({ force: true }); await page.waitForTimeout(1200); b = await bodyText(page); console.log('after addr click:', b.slice(0, 260).replace(/\n+/g, ' | ')); }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
