const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,400);
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('---', label, page.url().split('#')[1]||'', '---'); console.log(txt.slice(0,250));
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

  let notif = null;
  for (let i = 0; i < 30; i++) { notif = context.pages().find((p) => p.url().includes('notification')); if (notif) break; await hub.waitForTimeout(500); }
  await notif.waitForTimeout(1500);
  // Step 1: Connect
  const cbtn = notif.locator('[data-testid="confirm-btn"], button:has-text("Connect")').last();
  if (await cbtn.count()) { await cbtn.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(2000); }

  // Step 2: Add Arc Testnet (loop through any confirm/switch)
  for (let round = 0; round < 6; round++) {
    const body = ((await notif.locator('body').innerText().catch(()=>''))||'');
    if (body.includes('suggesting') || body.includes('network details') || body.startsWith('Add')) {
      const conf = notif.locator('[data-testid="confirm-footer-button"], button:has-text("Confirm"), button:has-text("Switch network")').last();
      if (await conf.count()) { console.log('confirming add-network round', round); await conf.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(2500); }
    } else break;
  }
  await dump(notif, 'after network');
  // Step 3: SIWE sign message
  for (let round = 0; round < 6; round++) {
    const body = ((await notif.locator('body').innerText().catch(()=>''))||'');
    if (body.includes('Sign') || body.includes('reads as follows') || body.includes('personal_sign') || body.includes('sign message')) {
      const sig = notif.locator('[data-testid="confirm-footer-button"], button:has-text("Sign"), button:has-text("Confirm")').last();
      if (await sig.count()) { console.log('signing round', round); await sig.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(2500); }
    } else break;
  }
  await dump(notif, 'after sign');
  console.log('hub:', ((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,200));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
