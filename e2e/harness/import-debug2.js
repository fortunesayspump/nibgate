const mm = require('./mm');
async function dumpRows(page, label) {
  console.log('---', label, '---');
  const items = page.locator('[role="menuitem"], li, [data-testid="import-wallet-option"], button');
  const n = await items.count().catch(()=>0);
  console.log('rows:', n);
  for (let i=0;i<Math.min(n,20);i++){
    const t = ((await items.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,60);
    const d = await items.nth(i).getAttribute('data-testid').catch(()=>null);
    const tag = await items.nth(i).evaluate(el=>el.tagName).catch(()=>null);
    if (t || d) console.log(' ', tag, '|', d||'', '|', t);
  }
}
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  await mm.clickIf(home0, '[data-testid="account-menu-icon"]');
  await home0.waitForTimeout(1000);
  await mm.clickIf(home0, '[data-testid="account-list-add-wallet-button"]');
  await home0.waitForTimeout(1000);
  await dumpRows(home0, 'add wallet rows');
  await context.close(); process.exit(0);
}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
