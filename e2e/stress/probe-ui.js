const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await install({ page, pk: SEL_PK });
  // MINE rows
  await page.goto('https://nibgate.xyz/share/mine', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 'm', log: () => {} });
  await page.waitForTimeout(2500);
  console.log('== /share/mine ==');
  let b = await bodyText(page);
  console.log('body:', b.slice(0, 300).replace(/\n+/g, ' | '));
  const rows = await page.locator('[role="button"], button, a').evaluateAll((els) => els.map((e) => e.innerText.trim().slice(0, 30)).filter(Boolean).slice(0, 30));
  console.log('controls:', JSON.stringify(rows));
  // Dashboard sidebar tabs
  console.log('== /dashboard sidebar ==');
  await page.goto('https://nibgate.xyz/dashboard', { waitUntil: 'commit' });
  await page.waitForTimeout(3000);
  const tabs = await page.locator('a, button').evaluateAll((els) => els.map((e) => ({ t: e.innerText.trim().slice(0, 22), h: e.getAttribute('href') })).filter((x) => /[Ss]ites|[Cc]ontents|[Aa]nalytics|[Ee]arnings|[Pp]rofile|Creator setup|Connected origins|Protected routes/.test(x.t)).slice(0, 12));
  console.log('dash tabs:', JSON.stringify(tabs, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
