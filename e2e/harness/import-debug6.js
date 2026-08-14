const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  await mm.clickIf(home0, '[data-testid="account-menu-icon"]');
  await home0.waitForTimeout(1000);
  await mm.clickIf(home0, '[data-testid="account-list-add-wallet-button"]');
  await home0.waitForTimeout(1200);
  const html = await home0.locator('body').innerHTML().catch(()=>'');
  const rows = [...html.matchAll(/data-testid="([^"]+)"[^>]*>[\s\S]{0,200}?(Import an account|Via a private key|Using a 12)[^<]{0,30}/gi)];
  rows.forEach((m)=>{ console.log('ROW:', m[1], '->', m[2]); });
  const idx = html.indexOf('Via a private key');
  console.log('private-key row testid:', (html.slice(0, idx).match(/data-testid="([^"]+)"/g)||[]).pop());
  await context.close(); process.exit(0);
}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
