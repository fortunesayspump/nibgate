const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,300);
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,35);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('---', label, '---'); console.log(txt.slice(0,220));
  console.log('  buttons:', list.slice(0,25).join(' | ') || '(none)');
}
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  await hub.locator('button:has-text("Connect wallet")').first().click();
  await hub.waitForTimeout(1500);

  // phase 1: find unlock popup, unlock it
  for (let i = 0; i < 20; i++) {
    const pop = context.pages().find((p) => p.url().includes('/unlock'));
    if (pop) {
      const pw = pop.locator('input[type="password"]').first();
      if (await pw.count()) {
        await pw.fill(mm.PASSWORD);
        await pop.locator('[data-testid="unlock-submit"]').first().click({ force: true }).catch(()=>{});
        console.log('unlocked popup');
      }
      break;
    }
    await hub.waitForTimeout(500);
  }
  // phase 2: wait for the approval popup (notification or a new home.html tab)
  let appr = null;
  for (let i = 0; i < 30; i++) {
    appr = context.pages().find((p) => (p.url().includes('notification') || (p.url().includes('home.html#') && p !== home0 && !p.url().includes('/unlock'))) && p !== hub);
    if (appr) break;
    await hub.waitForTimeout(600);
  }
  if (!appr) { console.log('no approval popup; pages:'); for (const p of context.pages()) console.log('  ', p.url()); await context.close(); process.exit(1); }
  await appr.waitForTimeout(1500);
  await dump(appr, 'approval');
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
