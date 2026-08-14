const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await install({ page, pk: SEL_PK });
  // MINE Drafts
  await page.goto('https://nibgate.xyz/share/mine', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 'm', log: () => {} });
  await page.waitForTimeout(2500);
  const tabBtns = await page.locator('button').evaluateAll((els) => els.map((e) => e.innerText.trim().slice(0, 16)).filter(Boolean).slice(0, 14));
  console.log('mine buttons:', JSON.stringify(tabBtns));
  const draftsBtn = page.locator('button').filter({ hasText: /^Drafts/ }).first();
  console.log('drafts btn count:', await draftsBtn.count());
  if (await draftsBtn.count()) { await draftsBtn.click({ force: true }); await page.waitForTimeout(1800); }
  const body = await bodyText(page);
  console.log('after Drafts click:', body.slice(0, 260).replace(/\n+/g, ' | '));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
