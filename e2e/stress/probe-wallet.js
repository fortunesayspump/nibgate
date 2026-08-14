const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
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
  await page.waitForTimeout(1000);
  const b = await bodyText(page);
  console.log('share form body:', b.slice(0, 300).replace(/\n+/g, ' | '));
  const btns = await page.locator('button').evaluateAll((els) => els.map((e) => e.innerText.trim().slice(0, 20)).filter(Boolean).slice(0, 20));
  console.log('buttons:', JSON.stringify(btns));
  // open wallet menu
  const addr = page.getByText(/0x7099/i).first();
  await addr.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);
  const b2 = await bodyText(page);
  console.log('after wallet click:', b2.slice(0, 250).replace(/\n+/g, ' | '));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
