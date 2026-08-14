const mm = require('./mm');
async function dump(home, label) {
  const txt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,400);
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
  await dump(home, 'add-wallet');
  // click text "Via a private key" at its coordinates
  const pk = home.locator('text="Via a private key"').first();
  const box = await pk.boundingBox();
  if (box) {
    await home.mouse.dblclick(box.x + box.width/2, box.y + box.height/2).catch(()=>{});
    await home.waitForTimeout(1000);
    await dump(home, 'after dblclick private key');
  }
  // try clicking "Import an account" text
  const ia = home.locator('text="Import an account"').first();
  const ib = await ia.boundingBox();
  if (ib) { await home.mouse.click(ib.x + ib.width/2, ib.y + ib.height/2); await home.waitForTimeout(900); await dump(home, 'after click import account'); }
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
