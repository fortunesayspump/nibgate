const mm = require('./mm');
async function dump(home, label) {
  const txt = ((await home.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,400);
  console.log('---', label, '---'); console.log(txt);
}
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  // open run the network selector in top-right (shows "Ethereum")
  const netBtn = home.locator('[data-testid="network-display"], [data-testid="account-menu-open-button"]').first();
  await mm.clickIf(home, '[data-testid="network-display"]');
  await home.waitForTimeout(800);
  await dump(home, 'network menu');
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
