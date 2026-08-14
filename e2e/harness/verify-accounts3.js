const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  const mainTxt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,120);
  console.log('main:', mainTxt);
  await mm.clickIf(home, '[data-testid="account-menu-icon"]');
  await home.waitForTimeout(900);
  const txt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,400);
  console.log('accounts:', txt);
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
