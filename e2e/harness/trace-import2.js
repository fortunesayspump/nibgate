const mm = require('./mm');
async function dump(home, label) {
  const btns = home.locator('button, [role="button"], input, textarea'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    const ph = await btns.nth(i).getAttribute('placeholder').catch(()=>null);
    if (t || tid || ph) list.push((tid||'') + ' :: ' + (t||('ph:'+ph)));
  }
  console.log('---', label, '---'); console.log(list.slice(0,30).join('\n'));
}
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  await mm.clickIf(home, '[data-testid="account-menu-icon"]');
  await home.waitForTimeout(800);
  await mm.clickIf(home, '[data-testid="account-list-add-wallet-button"]');
  await home.waitForTimeout(800);
  await dump(home, 'add-wallet');
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
