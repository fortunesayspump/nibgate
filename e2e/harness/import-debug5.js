const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  await mm.clickIf(home0, '[data-testid="account-menu-icon"]');
  await home0.waitForTimeout(1200);
  console.log('menu body:', (await home0.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,300));
  await mm.clickIf(home0, '[data-testid="account-list-add-wallet-button"]');
  await home0.waitForTimeout(1500);
  console.log('add-wallet body:', (await home0.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,400));
  const html = await home0.locator('body').innerHTML().catch(()=>'');
  console.log('has private-key testid:', html.includes('choose-wallet-type-private-key'));
  console.log('has seedphrase testid:', html.includes('choose-wallet-type-import'));  
  await context.close(); process.exit(0);
}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
