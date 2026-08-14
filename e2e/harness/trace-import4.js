const mm = require('./mm');
async function dump(home, label) {
  const btns = home.locator('button, input, textarea, [role="button"]'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,50);
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
  // click "Import" text -> shows the two options (phrase / private key)... click the card row
  const importRow = home.locator('button:has-text("Import a wallet"), [data-testid="import-wallet-button"], div:has-text("Import a wallet")').first();
  console.log('importRow count:', await importRow.count());
  if (await importRow.count()) await importRow.click({ force: true }).catch(()=>{});
  await home.waitForTimeout(800);
  await dump(home, 'after import-a-wallet');
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
