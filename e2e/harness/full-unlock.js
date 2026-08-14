const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,300);
  console.log('---', label, '---', page.url().split('#')[1]||'#');
  console.log('  ', txt.slice(0,220));
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,35);
    if (t) list.push(i + ' :: ' + t);
  }
  console.log('  btns:', list.slice(0,15).join(' | '));
}
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  for (const p of context.pages()) { if (!p.url().includes('localhost')) await p.close().catch(()=>{}); }
  const hub = await context.newPage();
  hub.setDefaultTimeout(20000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(5000);
  await dump(hub, 'hub start');
  // If connected+ signed-in, unlock copy should be granted for 0.01 USDC
  // click Hold to pay (unlock button)
  const hold = hub.locator('button:has-text("Hold to pay")').first();
  if (await hold.count()) {
    console.log('clicking Hold to pay');
    await hold.click();
    await hub.waitForTimeout(4000);
    await dump(hub, 'hub after hold');
  }
  // watch for notification pages
  const seen = new Set();
  context.on('page', (p) => { p.on('domcontentloaded', () => console.log('[NEW PAGE]', p.url())); });
  for (let t = 0; t < 30; t++) {
    await hub.waitForTimeout(700);
    const notif = context.pages().find((p) => p.url().includes('notification'));
    if (notif) {
      const u = notif.url();
      if (!seen.has(u)) { seen.add(u); console.log('[notif]', u); await dump(notif, 'notif'); }
      // try clicking confirm
      const conf = notif.locator('[data-testid="confirm-footer-button"], [data-testid="confirm-btn"]').last();
      if (await conf.count()) { await conf.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(1800).catch(()=>{}); await dump(notif, 'after confirm'); }
    }
  }
  await hub.waitForTimeout(2000);
  await dump(hub, 'hub final');
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
