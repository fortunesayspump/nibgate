const mm = require('./mm');
async function dump(home, label) {
  const txt = await home.locator('body').innerText().catch(()=>'');
  console.log('---', label, '---');
  console.log(txt.replace(/\s+/g,' | ').slice(0,400));
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
  // any clickable list item - dump all buttons with text
  const btns = home.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,50);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('--- buttons ---'); console.log(list.slice(0,30).join('\n'));
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
