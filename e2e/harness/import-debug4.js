const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  await mm.clickIf(home0, '[data-testid="account-menu-icon"]');
  await home0.waitForTimeout(1000);
  await mm.clickIf(home0, '[data-testid="account-list-add-wallet-button"]');
  await home0.waitForTimeout(1200);
  await home0.locator('[data-testid="choose-wallet-type-private-key"]').click();
  await home0.waitForTimeout(2000);
  const body = await home0.locator('body').innerText().catch(()=>'');
  console.log('BODY:', body.replace(/\s+/g,'|').slice(0,400));
  const html = await home0.locator('body').innerHTML().catch(()=>'');
  const m = html.match(/data-testid="([^"]*(?:import|private|key)[^"]*)"/g);
  console.log('testids:', m ? [...new Set(m)].join(' ') : 'none');
  await context.close(); process.exit(0);
}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
