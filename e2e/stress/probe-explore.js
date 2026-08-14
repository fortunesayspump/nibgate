const { bodyText } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto('https://nibgate.xyz/explore', { waitUntil: 'commit' });
  await page.waitForTimeout(3500);
  const b = await bodyText(page);
  console.log('BODY:', b.slice(0, 400).replace(/\n+/g, ' | '));
  const links = await page.locator('a').evaluateAll((els) => els.map((e) => (e.getAttribute('href') || '').slice(0, 60)).filter((x) => /ns|content|post|doc/i.test(x)).slice(0, 15));
  console.log('content links:', JSON.stringify(links));
  const inputs = await page.locator('input').evaluateAll((els) => els.map((e) => e.placeholder));
  console.log('inputs:', JSON.stringify(inputs));
  const sels = await page.locator('select').count();
  console.log('selects:', sels);
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
