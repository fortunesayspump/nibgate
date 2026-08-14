const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,300);
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,35);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('---', label, page.url(), '---'); console.log(txt.slice(0,220));
  console.log('  buttons:', list.slice(0,25).join(' | ') || '(none)');
}
async function main() {
  const { context, extensionId } = await mm.launch();
  // boot & unlock, keep home open
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  console.log('wallet ready');

  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  await hub.locator('button:has-text("Connect wallet")').first().click();
  await hub.waitForTimeout(1500);
  console.log('hub says:', ((await hub.locator('body').innerText()||'').match(/Process[^\n]*|Connecting[^\n]*/i)||['?'])[0].slice(0,40));
  // wait for popup
  let pop = null;
  for (let i = 0; i < 20; i++) {
    pop = context.pages().find((p) => p.url().includes('/unlock') || p.url().includes('notification') || (p.url().includes('home.html#') && p !== home0));
    if (pop) break;
    await hub.waitForTimeout(500);
  }
  if (!pop) { console.log('no popup'); await context.close(); process.exit(1); }
  await pop.waitForTimeout(2000);
  await dump(pop, 'popup');
  // If unlock appears, unlock then dump again
  const pw = pop.locator('input[type="password"]').first();
  if (await pw.count()) {
    await pw.fill(mm.PASSWORD);
    await pop.locator('[data-testid="unlock-submit"], button:has-text("Unlock")').first().click({ force: true }).catch(()=>{});
    await pop.waitForTimeout(2500);
    await dump(pop, 'popup after unlock');
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
