const mm = require('./mm');
async function dump(home, label) {
  const txt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,300);
  console.log('---', label, '---'); console.log(txt);
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
  // fill private key
  const ta = home.locator('textarea, input[type="password"]').first();
  console.log('input count:', await home.locator('textarea, input[type="password"]').count());
  if (await ta.count()) {
    await ta.fill(mm.TEST_PK);
    await home.locator('button:has-text("Import")').last().click({ force: true }).catch(()=>{});
    await home.waitForTimeout(1500);
    await dump(home, 'after import');
  }
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
