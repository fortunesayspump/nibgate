const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  await mm.clickIf(home0, '[data-testid="account-menu-icon"]');
  await home0.waitForTimeout(1000);
  await mm.clickIf(home0, '[data-testid="account-list-add-wallet-button"]');
  await home0.waitForTimeout(1200);
  const pkOpt = home0.locator('[data-testid="choose-wallet-type-private-key"]');
  console.log('pk option count:', await pkOpt.count());
  await pkOpt.click().catch(e=>console.log('click err', e.message));
  await home0.waitForTimeout(1500);
  const ta = home0.locator('textarea[data-testid="account-import-private-key-input"], input[type="password"]').first();
  console.log('input count:', await ta.count());
  await ta.fill(mm.TEST_PK);
  await home0.waitForTimeout(400);
  await mm.clickIf(home0, '[data-testid="import-account-confirm-button"]', null, true);
  await home0.waitForTimeout(2000);
  console.log('after import:', await mm.body(home0));
  await context.close(); process.exit(0);
}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
