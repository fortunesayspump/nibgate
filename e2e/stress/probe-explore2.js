const { bodyText } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto('https://nibgate.xyz/explore', { waitUntil: 'commit' });
  await page.waitForTimeout(3500);
  const btns = await page.locator('button').evaluateAll((els) => els.map((e) => e.innerText.trim().slice(0, 26)).filter(Boolean).slice(0, 20));
  console.log('buttons:', JSON.stringify(btns));
  const chips = await page.locator('a[href*="q="]').evaluateAll((els) => els.map((e) => e.innerText.trim().slice(0, 26)).filter(Boolean).slice(0, 12));
  console.log('q-links:', JSON.stringify(chips));
  // search behavior
  const inp = page.locator('input[placeholder*="Search"]');
  await inp.fill('compost');
  await page.waitForTimeout(2500);
  const b = await bodyText(page);
  console.log('after search "compost":', b.slice(0, 240).replace(/\n+/g, ' | '));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
