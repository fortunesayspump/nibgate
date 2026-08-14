const { install, makeWallet } = require('./prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  const w = await makeWallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  await install({ page, wallet: w.wallet });   // install BEFORE any navigation
  console.log('installed (init script registered). now goto');
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit', timeout: 45000 });
  await page.waitForTimeout(3500);
  console.log('body1:', (await page.locator('body').innerText()).split('\n').filter(l=>l.trim()).slice(0,12).join(' | '));
  await page.getByText(/connect wallet/i).first().click();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    const lines = body.split('\n').filter(l=>l.trim());
    console.log(`t=${(i+1)*1.5}s tail:`, lines.slice(-8).join(' | '));
    if (/sign the message/i.test(body)) { console.log('SIWE PROMPT REACHED'); break; }
    if (/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/.test(body)) { console.log('ADDRESS SHOWN'); break; }
  }
  await browser.close();
})().catch(e=>{ console.error('ERR', e.message); process.exit(1); });
