const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto('https://nibgate.xyz/explore', { waitUntil: 'commit' });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    const skip = new Set(['NAV', 'UL', 'A']);
    document.querySelectorAll('body *').forEach((el) => {
      if (skip.has(el.tagName) || el.children.length > 50) return;
      const st = getComputedStyle(el);
      if (st.position === 'fixed' || st.position === 'absolute') return;
      if (st.display === 'none' || st.visibility === 'hidden') return;
      const w = el.getBoundingClientRect().width;
      if (w > vw + 2) out.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 90), w: Math.round(w) });
    });
    return { vw, out: out.slice(0, 16) };
  });
  console.log('clientW:', r.vw);
  console.log(JSON.stringify(r.out, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
