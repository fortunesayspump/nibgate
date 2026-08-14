const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,400);
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('---', label, '---'); console.log(txt.slice(0,300));
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
  await hub.waitForTimeout(2000);
  // find the metamask popup page
  for (let i = 0; i < 10; i++) {
    const pop = context.pages().find((p) => p.url().includes('/unlock') || p.url().includes('notification'));
    if (pop) {
      await pop.waitForTimeout(1000);
      // unlock the popup if needed
      const pw = pop.locator('input[type="password"]').first();
      if (await pw.count()) {
        await pw.fill(mm.PASSWORD);
        await pop.locator('[data-testid="unlock-submit"], button:has-text("Unlock")').first().click({ force: true }).catch(()=>{});
        await pop.waitForTimeout(1500);
      }
      await dump(pop, 'popup');
      // Try generic approval: find primary button "Approve" / "Confirm" / "Connect" / "Add network"
      for (const label of ['Approve','Confirm','Connect','Add network','Sign']) {
        const b = pop.locator(`button:has-text("${label}")`).last();
        if (await b.count()) { console.log('clicking', label); await b.click({ force: true, timeout: 10000 }).catch(()=>{}); await pop.waitForTimeout(1200); await dump(pop, 'after ' + label); }
      }
      break;
    }
    await hub.waitForTimeout(600);
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });