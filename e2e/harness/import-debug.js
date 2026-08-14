const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,400);
  const btns = page.locator('button'); const nb = await btns.count(); const list=[];
  for (let i=0;i<nb;i++){ const t=((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40); const d=await btns.nth(i).getAttribute('data-testid').catch(()=>null); if(t||d) list.push((d||'')+'::'+t); }
  console.log('---',label,'---', txt.slice(0,350));
  console.log('  btns:', list.join(' | ')||'(none)');
}
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  await mm.clickIf(home0, '[data-testid="account-menu-icon"]');
  await home0.waitForTimeout(1200);
  await dump(home0, 'account menu');
  await mm.clickIf(home0, '[data-testid="account-list-add-wallet-button"]');
  await home0.waitForTimeout(1200);
  await dump(home0, 'add wallet');
  await context.close(); process.exit(0);
}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
