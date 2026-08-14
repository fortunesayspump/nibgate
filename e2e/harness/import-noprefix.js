const mm = require('./mm');
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
  await home.waitForTimeout(900);
  const ta = home.locator('textarea, input[type="password"]').first();
  await ta.fill(mm.TEST_PK.slice(2)); // strip 0x
  await home.waitForTimeout(400);
  await home.locator('[data-testid="import-account-confirm-button"]').first().click({ force: true });
  await home.waitForTimeout(2000);
  const txt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,400);
  console.log('after:', txt);
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
