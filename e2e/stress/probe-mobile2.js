const { install, connectSellerFlow, SEL_PK, bodyText } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/explore', { waitUntil: 'commit' });
  await page.waitForTimeout(3500);
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 2 && el.children.length < 12) out.push({ tag: el.tagName, cls: (el.className && el.className.toString ? el.className.toString().slice(0, 80) : ''), w: Math.round(r.width) });
    });
    return { vw, viewport: document.querySelector('meta[name="viewport"]') && document.querySelector('meta[name="viewport"]').content, culprits: out.slice(0, 12) };
  });
  console.log('viewport meta:', wide.viewport, 'clientW:', wide.vw);
  console.log('culprits:', JSON.stringify(wide.culprits, null, 1));
  // bell dropdown bounds on mine
  await page.goto('https://nibgate.xyz/share/mine', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 'm', log: () => {} });
  await page.waitForTimeout(2500);
  const bell = page.locator('button[title="Notifications"]').first();
  if (await bell.count()) {
    await bell.click({ force: true });
    await page.waitForTimeout(900);
    const drop = await page.evaluate(() => {
      const els = [...document.querySelectorAll('div')].filter((d) => d.innerText && d.innerText.startsWith('Recent activity'));
      if (!els.length) return null;
      const r = els[0].getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), iw: window.innerWidth, ok: r.left >= 0 && r.right <= window.innerWidth + 1 };
    });
    console.log('dropdown bounds:', JSON.stringify(drop));
  } else console.log('no bell');
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
