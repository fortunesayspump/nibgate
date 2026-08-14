const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  await mm.clickIf(home, '[data-testid="account-menu-icon"]');
  await home.waitForTimeout(800);
  await mm.clickIf(home, '[data-testid="account-list-add-wallet-button"]');
  await home.waitForTimeout(1000);
  const matches = home.locator('text="Via a private key"');
  const el = matches.first();
  // walk up ancestors and print tag/class/testid/role
  const chain = await el.evaluate((e) => {
    const out = [];
    let cur = e;
    for (let i = 0; i < 6 && cur; i++) {
      out.push(`${cur.tagName} class="${(cur.getAttribute('class')||'').slice(0,50)}" testid="${cur.getAttribute('data-testid')||''}" role="${cur.getAttribute('role')||''}"`);
      cur = cur.parentElement;
    }
    return out;
  }).catch(()=>['?']);
  console.log(chain.join('\n'));
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
