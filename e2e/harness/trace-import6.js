const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  await mm.clickIf(home, '[data-testid="account-menu-icon"]');
  await home.waitForTimeout(800);
  await mm.clickIf(home, '[data-testid="account-list-add-wallet-button"]');
  await home.waitForTimeout(1000);
  // find all elements that directly contain 'private key'
  const matches = home.locator('text="Via a private key"');
  const n = await matches.count();
  console.log('text matches:', n);
  for (let i = 0; i < n; i++) {
    const el = matches.nth(i);
    const tag = await el.evaluate((e) => e.tagName).catch(()=>'?');
    const cls = (await el.getAttribute('class').catch(()=>''))||'';
    const box = await el.boundingBox();
    const parentTag = await el.evaluate((e) => e.parentElement ? e.parentElement.tagName + '.' + (e.parentElement.getAttribute('class')||'').slice(0,30) : '?').catch(()=>'?');
    console.log(i, tag, 'box:', JSON.stringify(box), 'parent:', parentTag);
  }
  // Try clicking each ancestor button-like
  for (let i = 0; i < n; i++) {
    const el = matches.nth(i);
    const btn = el.locator('xpath=ancestor::*[self::button or self::a or @role="button"][1]');
    const bc = await btn.count();
    console.log('ancestor button count for', i, ':', bc);
  }
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
