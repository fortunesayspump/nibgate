const { install, connectSellerFlow, SEL_PK, bodyText } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
const f = require('./fixtures.json');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await install({ page, pk: SEL_PK });
  for (const url of ['https://nibgate.xyz/', 'https://nibgate.xyz/share', 'https://nibgate.xyz/explore', `https://nibgate.xyz/ns/${f.paid.slug}`]) {
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForTimeout(3200);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, scrollX: window.scrollX }));
    const overflow = m.sw > m.iw + 1;
    const b = await bodyText(page);
    console.log(`${url}\n   overflow=${overflow} scrollW=${m.sw} innerW=${m.iw} | ${b.slice(0, 90).replace(/\n+/g, ' ')}`);
  }
  // mine + bell dropdown (needs connect)
  await page.goto('https://nibgate.xyz/share/mine', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 'm', log: () => {} });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  console.log(`mine overflow=${m.sw > m.iw + 1} sw=${m.sw} iw=${m.iw}`);
  const bell = page.locator('button[title="Notifications"]').first();
  const bellN = await bell.count();
  console.log('bell count:', bellN);
  if (bellN) {
    await bell.click({ force: true });
    await page.waitForTimeout(1000);
    const drop = await page.evaluate(() => {
      const el = document.querySelector('.absolute.right-0.top-full, [class*="shadow-xl"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), iw: window.innerWidth, ok: r.left >= 0 && r.right <= window.innerWidth + 1 };
    });
    console.log('dropdown bounds:', JSON.stringify(drop));
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
