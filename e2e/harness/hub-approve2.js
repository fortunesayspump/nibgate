const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,400);
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('---', label, page.url(), '---'); console.log(txt.slice(0,250));
  console.log('  buttons:', list.join(' | ') || '(none)');
}
async function main() {
  const { context, extensionId } = await mm.launch();
  await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(context.pages()[0]).catch(()=>{});
  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  await hub.locator('button:has-text("Connect wallet")').first().click();
  await hub.waitForTimeout(2500);
  console.log('--- pages after connect click ---');
  for (const p of context.pages()) console.log('  ', p.url());
  // find popup
  let pop = context.pages().find((p) => p.url().includes('/unlock') || p.url().includes('notification'));
  if (!pop) { console.log('no popup found'); await context.close(); process.exit(1); }
  const pw = pop.locator('input[type="password"]').first();
  if (await pw.count()) {
    await pw.fill(mm.PASSWORD);
    await pop.locator('[data-testid="unlock-submit"], button:has-text("Unlock")').first().click({ force: true }).catch(()=>{});
    await pop.waitForTimeout(2000);
  }
  await dump(pop, 'popup after unlock');
  // maybe it's the connection request now (accounts + connect button)
  for (const label of ['Connect','Next','Confirm']) {
    const b = pop.locator(`button:has-text("${label}")`).last();
    if (await b.count()) { console.log('clicking', label); await b.click({ force: true, timeout: 8000 }).catch(()=>{}); await pop.waitForTimeout(1500); await dump(pop, 'after ' + label); }
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
