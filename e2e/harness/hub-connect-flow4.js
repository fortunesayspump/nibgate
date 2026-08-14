const mm = require('./mm');
async function dump(page, label) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,300);
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,35);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'') + ' :: ' + t);
  }
  console.log('---', label, '| url:', page.url().split('#')[1]||'#', '---');
  console.log('  body:', txt.slice(0,180));
  console.log('  btns:', list.slice(0,18).join(' | '));
}
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  for (const p of context.pages()) { if (!p.url().includes('localhost')) await p.close().catch(()=>{}); }
  const hub = await context.newPage();
  hub.setDefaultTimeout(20000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  for (let i = 0; i < 10; i++) {
    const b = hub.locator('button:has-text("Connect wallet")').first();
    if (await b.count()) { await b.click(); break; }
    await hub.waitForTimeout(800);
  }
  await hub.waitForTimeout(2500);
  await hub.locator('w3m-modal button:has-text("MetaMask installed")').first().click();
  let notif = null;
  for (let i = 0; i < 30; i++) { notif = context.pages().find((p) => p.url().includes('notification')); if (notif) break; await hub.waitForTimeout(500); }
  await notif.waitForTimeout(1800);
  await dump(notif, 'start');

  // click Connect (confirm-btn)
  const cb = notif.locator('[data-testid="confirm-btn"]').first();
  if (await cb.count()) { await cb.click({ force: true }); await notif.waitForTimeout(2500); }
  await dump(notif, 'after connect');

  // generic loop: every round, dump + try to click last confirm/footer primary
  for (let round = 0; round < 10; round++) {
    const body = ((await notif.locator('body').innerText().catch(()=>''))||'');
    const primary = notif.locator('[data-testid="confirm-footer-button"], [data-testid="confirm-btn"], [data-testid="personal-sign-msg-sign-button"]').last();
    if (await primary.count()) {
      console.log('round', round, 'clicking primary; body says:', body.slice(0,80));
      await primary.click({ force: true }).catch(()=>{});
      await notif.waitForTimeout(2500);
      await dump(notif, 'round ' + round);
    } else {
      console.log('round', round, 'no primary; stopping. body:', body.slice(0,120));
      break;
    }
  }
  console.log('HUB:', ((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,220));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
