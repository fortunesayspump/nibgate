const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  await mm.clickIf(home, '[data-testid="network-display"]');
  await home.waitForTimeout(800);
  const txt = (await home.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|');
  console.log('networks:', txt.slice(0,500));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
