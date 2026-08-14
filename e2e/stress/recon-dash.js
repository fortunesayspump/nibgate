// recon dashboard + subblog post for admin controls
const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/dashboard', { waitUntil: 'commit' });
  await page.waitForTimeout(3500);
  await connectSellerFlow(page, { label: 'd', log: () => {} });
  await page.waitForTimeout(2500);
  const items = await page.locator('button, a, input, select, textarea, [role="tab"]').evaluateAll((els) => els.slice(0, 80).map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('role') || ''}][${e.getAttribute('href') || ''}] "${(e.innerText || e.value || e.placeholder || '').trim().slice(0, 38)}"`));
  console.log('\n== DASHBOARD (seller authed) ==', items.length);
  for (const i of items) console.log('  ', i);
  const body = await bodyText(page);
  console.log('\nBODY:', body.slice(0, 600).replace(/\n+/g, ' | '));
  await browser.close();
})().catch((e) => { console.error('RECON FAIL', e); process.exit(1); });