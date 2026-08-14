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
  const m = html.match(/<div[^>]*class="[^"]*"[^>]*>[\s\S]{0,80}Via a private key[\s\S]{0,200}/i);
  if (m) console.log('MATCH:', m[0].slice(0,400));
  else console.log('no match; searching "Via a private" context...');
  const idx = html.indexOf('Via a private key');
  console.log('idx:', idx);
  if (idx > 0) console.log('CTX:', html.slice(idx-300, idx+300));
  await context.close(); process.exit(0);
}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
