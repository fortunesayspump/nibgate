const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/share/mine', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 'm', log: () => {} });
  await page.waitForTimeout(2500);
  for (const tab of ['Active', 'Ended', 'Drafts', 'All']) {
    const btn = page.locator('button').filter({ hasText: tab }).first();
    await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    const parts = (await bodyText(page)).split(' | ');
    console.log(`[${tab}] ${parts.slice(7, 22).join(' | ')}`);
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
