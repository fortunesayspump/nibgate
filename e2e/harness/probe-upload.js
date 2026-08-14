const { install, connectSellerFlow, bodyText, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  await install({ page, pk: SEL_PK });
  page.on('request', (r) => { if (/uploads|session|cookie/.test(r.url()) && !/\.js|\.css|\.png|\.ico/.test(r.url())) console.log('REQ', r.method(), r.url()); });
  page.on('response', async (r) => {
    if (/uploads|nibshare|auth/.test(r.url()) && !/\.js|\.css/.test(r.url())) {
      const t = await r.text().catch(() => '');
      console.log('RESP', r.status(), r.url().slice(0, 110), t.slice(0, 200));
    }
  });
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit', timeout: 45000 });
  await page.waitForTimeout(3000);
  await connectSellerFlow(page, { label: 'seller', log: (s) => console.log(s) });
  console.log('AUTH body sample:', (await bodyText(page)).slice(0, 120));
  if (await page.getByRole('button', { name: /sign with wallet/i }).count()) {
    await page.getByRole('button', { name: /sign with wallet/i }).click();
    await page.waitForTimeout(3000);
  }
  console.log('state after auth:', (await bodyText(page)).slice(0, 160));
  await page.locator('select.input-field').first().selectOption('photo');
  await page.waitForTimeout(1200);
  const fcP = page.waitForEvent('filechooser', { timeout: 15000 });
  await page.getByText(/click or drag to add/i).first().click().catch(() => {});
  const fc = await fcP;
  await fc.setFiles('/tmp/opencode/fixtures/tiny.png');
  await page.waitForTimeout(6000);
  const errs = await page.locator('div').filter({ hasText: /failed/i }).allInnerTexts().catch(() => []);
  console.log('ERROR DIVS:', JSON.stringify(errs.filter((e) => e.trim()).slice(0, 6)));
  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
