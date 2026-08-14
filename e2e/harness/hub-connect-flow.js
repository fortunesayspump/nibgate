const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,400);
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('---', label, '---', page.url().split('#')[1]||''); console.log(txt.slice(0,250));
  console.log('  buttons:', list.slice(0,20).join(' | ') || '(none)');
}
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  for (const p of context.pages()) { if (!p.url().includes('localhost')) await p.close().catch(()=>{}); }
  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  await hub.locator('button:has-text("Connect wallet")').first().click();
  await hub.waitForTimeout(2500);
  await hub.locator('w3m-modal button:has-text("MetaMask installed")').first().click();

  // wait for notification page
  let notif = null;
  for (let i = 0; i < 30; i++) {
    notif = context.pages().find((p) => p.url().includes('notification'));
    if (notif) break;
    await hub.waitForTimeout(500);
  }
  if (!notif) { console.log('no notification page'); await context.close(); process.exit(1); }
  await notif.waitForTimeout(2000);
  await dump(notif, 'connect step 1');
  // find and click confirm/connect buttons
  for (const label of ['Confirm','Connect','Next','Approve']) {
    const b = notif.locator(`button:has-text("${label}")`).last();
    if (await b.count()) { await b.click({ force: true, timeout: 10000 }).catch(()=>{}); await notif.waitForTimeout(1500); await dump(notif, 'after ' + label); }
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
