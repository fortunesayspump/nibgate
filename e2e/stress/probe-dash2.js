// probe: /dashboard/sites splash resolution + its own connect flow
const { install, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/dashboard/sites', { waitUntil: 'commit' });
  const snap = async (lbl) => { const b = await bodyText(page); console.log(`[${lbl}] url=${page.url()} | ${b.slice(0, 200).replace(/\n+/g, ' | ')}`); return b; };
  await page.waitForTimeout(1500); let b = await snap('t+1.5s');
  await page.waitForTimeout(4000); b = await snap('t+5.5s');
  if (/Connect wallet/i.test(b)) {
    await page.getByText(/connect wallet/i).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1800);
    const mr = page.getByText(/mock wallet/i).first();
    if (await mr.count()) { await mr.click().catch(() => {}); await page.waitForTimeout(1500); }
    if (/Sign the message/i.test(await bodyText(page))) { await page.getByRole('button', { name: /sign with wallet/i }).first().click({ force: true }).catch(() => {}); await page.waitForTimeout(2500); }
    await page.waitForTimeout(2500);
    await snap('after dashboard connect+sign');
  }
  await page.waitForTimeout(4000);
  await snap('t+final');
  const c = await page.locator('input, textarea').count();
  console.log('form inputs now:', c);
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });