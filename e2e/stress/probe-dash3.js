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
  await page.waitForTimeout(1200);
  for (const path of ['/dashboard', '/dashboard/sites', '/dashboard/content', '/dashboard/analytics', '/dashboard/earnings']) {
    await page.goto('https://nibgate.xyz' + path, { waitUntil: 'commit' });
    await page.waitForTimeout(4500);
    const b = await bodyText(page);
    console.log(`\n== ${path} ==\n  ${b.slice(0, 300).replace(/\n+/g, ' | ')}`);
    const inputs = await page.locator('input, textarea, select, button').count();
    console.log(`  controls: ${inputs}`);
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
