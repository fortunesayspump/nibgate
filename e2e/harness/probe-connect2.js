const { install, makeWallet } = require('./prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit', timeout: 45000 });
  await page.waitForTimeout(3000);
  const w = await makeWallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  await install({ page, wallet: w.wallet });
  console.log('installed. now click connect');
  await page.getByText(/connect wallet/i).first().click();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1500);
    const d = await page.evaluate(() => Array.from(document.querySelectorAll('[role=dialog],dialog,.modal,div[class*=modal],div[class*=sheet],div[class*=panel]')).map((el) => el.innerText.slice(0,300)));
    const body = await page.locator('body').innerText();
    console.log(`t=${(i+1)*1.5}s dialogs=${JSON.stringify(d.slice(0,6))}`);
    console.log('   body tail:', body.split('\n').filter(l=>l.trim()).slice(-6).join(' | '));
    if (body.includes('Sign the message')) { console.log('SIWE PROMPT SEEN'); break; }
  }
  await browser.close();
})().catch(e=>{ console.error('ERR', e.message); process.exit(1); });
