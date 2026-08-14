const mm = require('./mm');
async function dump(home, label) {
  const txt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,500);
  console.log('---', label, '---'); console.log(txt);
  const inputs = home.locator('input, textarea'); const ni = await inputs.count();
  for (let i = 0; i < Math.min(ni,5); i++) {
    console.log('input[', i, '] type=', await inputs.nth(i).getAttribute('type'), 'ph=', await inputs.nth(i).getAttribute('placeholder'), 'testid=', await inputs.nth(i).getAttribute('data-testid'));
  }
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
  // try clicking the row that contains "Via a private key"
  const pkRow = home.locator('div').filter({ hasText: 'Via a private key' }).first();
  console.log('pkRow count:', await pkRow.count());
  if (await pkRow.count()) {
    const box = await pkRow.boundingBox();
    console.log('pkRow box:', JSON.stringify(box));
    if (box) await home.mouse.click(box.x + box.width/2, box.y + box.height/2);
    await home.waitForTimeout(1000);
    await dump(home, 'after pk row click');
  }
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
