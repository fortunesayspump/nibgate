const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  console.log('main before:', ((await home.locator('body').innerText()||'').replace(/\s+/g,'|')).slice(0,80));
  await mm.clickIf(home, '[data-testid="account-menu-icon"]');
  await home.waitForTimeout(800);
  await mm.clickIf(home, '[data-testid="account-list-add-wallet-button"]');
  await home.waitForTimeout(1000);
  const pk = home.locator('text="Via a private key"').first();
  const box = await pk.boundingBox();
  await home.mouse.dblclick(box.x + box.width/2, box.y + box.height/2).catch(()=>{});
  await home.waitForTimeout(900);
  const ta = home.locator('textarea, input[type="password"]').first();
  await ta.fill(mm.TEST_PK);
  await home.waitForTimeout(500);
  await home.locator('[data-testid="import-account-confirm-button"]').first().click({ force: true });
  await home.waitForTimeout(2000);
  // check add-wallet screen for success
  const addWalletTxt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,300);
  console.log('add-wallet after import:', addWalletTxt);
  // navigate back to main (click back-button if present)
  await mm.clickIf(home, '[data-testid="add-wallet-page-back-button"], .back-button, button:has-text("Back")');
  await home.waitForTimeout(1000);
  const mainTxt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,150);
  console.log('main after back:', mainTxt);
  // open account menu
  await mm.clickIf(home, '[data-testid="account-menu-icon"]');
  await home.waitForTimeout(900);
  const accTxt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,400);
  console.log('accounts:', accTxt);
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
