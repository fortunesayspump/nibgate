const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  await mm.clickIf(home, '[data-testid="account-options-menu-button"]');
  await home.waitForTimeout(800);
  const list = home.locator('[data-testid="account-menu-icon"], button, [role="button"]');
  const n = await list.count();
  for (let i = 0; i < n; i++) {
    const t = ((await list.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,50);
    if (t && t.length > 1) console.log(i, '::', t);
  }
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
