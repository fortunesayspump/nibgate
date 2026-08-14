const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  await home0.waitForTimeout(500);
  const bodyTxt = (await home0.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|');
  console.log('wallet:', bodyTxt.slice(0,250));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
