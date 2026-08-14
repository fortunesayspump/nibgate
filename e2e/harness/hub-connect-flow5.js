const mm = require('./mm');
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

  // generic click-through loop; stop when notification closes or no primary
  let closesNotif = false;
  try {
    notif.once('close', () => { console.log('>>> notification page CLOSED (all approvals done)'); closesNotif = true; });
    for (let round = 0; round < 12; round++) {
      const body = ((await notif.locator('body').innerText().catch(()=>''))||'');
      const primary = notif.locator('[data-testid="confirm-footer-button"], [data-testid="confirm-btn"]').last();
      if (!await primary.count()) { console.log('round', round, 'no primary; body:', body.slice(0,120)); break; }
      await primary.click({ force: true }).catch(()=>{});
      await notif.waitForTimeout(2000);
      if (closesNotif || !notif.isClosed()) {
        // continue checking whether closed next iteration
      }
      if (closesNotif) break;
    }
    await notif.waitForTimeout(500).catch(()=>{});
    await hub.waitForTimeout(3000);
    console.log('HUB AFTER:', ((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,250));
    console.log('hub pages:', context.pages().map(p=>p.url()).join(' | '));
    // check wallet session on hub
    try {
      const resp = await hub.request.get('http://localhost:3001/auth/session');
      console.log('session endpoint status:', resp.status());
    } catch(e) { console.log('session check err', e.message.slice(0,80)); }
  } catch (e) { console.log('loop end:', e.message.slice(0,80)); }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });