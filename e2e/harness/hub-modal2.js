const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  for (const p of context.pages()) { if (!p.url().includes('localhost')) await p.close().catch(()=>{}); }
  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  await hub.locator('button:has-text("Connect wallet")').first().click();
  await hub.waitForTimeout(3000);

  // find appkit / w3m modal containers
  const els = hub.locator('w3m-modal, appkit-modal, [data-testid*="w3m"], [data-testid*="appkit"], wui-flex, wui-button');
  const n = await els.count();
  console.log('modal-ish elements:', n);
  for (let i = 0; i < Math.min(n, 10); i++) {
    const el = els.nth(i);
    console.log('  ', await el.evaluate((e)=>e.tagName).catch(()=>'?'), 'visible:', await el.isVisible().catch(()=>false));
  }
  // check body html fragment for 'appkit' or 'w3m'
  const html = await hub.content();
  console.log('html contains w3m-modal:', html.includes('w3m-modal'));
  console.log('html contains appkit-modal:', html.includes('appkit-modal'));
  console.log('html contains w3m-connect-wallet:', html.includes('w3m-connect-wallet'));
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
