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
  await page.goto('https://nibgate.xyz/dashboard', { waitUntil: 'commit' });
  await page.waitForTimeout(2500);
  const links = await page.locator('a').evaluateAll((els) => els.map((e) => ({ t: e.innerText.trim().slice(0, 16), h: e.getAttribute('href') })).filter((x) => /content/i.test(x.t + ' ' + x.h)));
  console.log('content links:', JSON.stringify(links));
  for (const cand of ['/dashboard/content', '/dashboard/contents']) {
    const r = await ctx.request.get('https://nibgate.xyz' + cand);
    console.log(`GET ${cand} -> ${r.status()}`);
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
