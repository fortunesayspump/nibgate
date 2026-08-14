const mm = require('./mm');
async function dump(home, label) {
  const txt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,400);
  const btns = home.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,30);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    const dis = await btns.nth(i).isDisabled().catch(()=>false);
    if (t || tid) list.push(`${i}:${tid||''}::${t}${dis?'(disabled)':''}`);
  }
  console.log('---', label, '---', list.join(' | '));
}
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  await mm.clickIf(home, '[data-testid="account-menu-icon"]');
  await home.waitForTimeout(800);
  await mm.clickIf(home, '[data-testid="account-list-add-wallet-button"]');
  await home.waitForTimeout(1000);
  const pk = home.locator('text="Via a private key"').first();
  const box = await pk.boundingBox();
  await home.mouse.dblclick(box.x + box.width/2, box.y + box.height/2).catch(()=>{});
  await home.waitForTimeout(1000);
  await dump(home, 'import screen');
  const ta = home.locator('textarea, input[type="password"]').first();
  await ta.fill(mm.TEST_PK);
  await home.waitForTimeout(500);
  await dump(home, 'after fill');
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
