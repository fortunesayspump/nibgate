const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  // the left icon in header is the network picker
  await mm.clickIf(home, '[data-testid="network-display"], [data-testid="network-picker"]');
  await home.waitForTimeout(800);
  const btns = home.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    const aria = await btns.nth(i).getAttribute('aria-label').catch(()=>null);
    if (t || aria) list.push((aria||'') + ' :: ' + t);
  }
  console.log(list.join('\n'));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
