const mm = require('./mm');
async function dump(home, label) {
  const btns = home.locator('button, [role="button"]'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('---', label, '---'); console.log(list.slice(0,30).join('\n'));
}
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  await dump(home, 'main');
  // click account menu icon (the avatar near top-right)
  await clickByTestId(home, 'account-menu-icon');
  await home.waitForTimeout(800);
  await dump(home, 'after account-menu-icon');
  await context.close();
  process.exit(0);
  async function clickByTestId(h, id) {
    const loc = h.locator(`[data-testid="${id}"]`).first();
    if (await loc.count()) { await loc.click(); return true; }
    return false;
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
