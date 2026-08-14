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

  // Drive approvals: handle a sequence of notification pages, clicking primaries until each closes.
  let notif = null;
  for (let i = 0; i < 30; i++) { notif = context.pages().find((p) => p.url().includes('notification')); if (notif) break; await hub.waitForTimeout(500); }

  const clickThrough = async (n) => {
    let closed = false;
    n.once('close', () => { closed = true; });
    for (let round = 0; round < 12; round++) {
      if (closed || n.isClosed()) return 'closed';
      const body = ((await n.locator('body').innerText().catch(()=>''))||'');
      const primary = n.locator('[data-testid="confirm-footer-button"], [data-testid="confirm-btn"]').last();
      if (!(await primary.count().catch(()=>0))) { console.log('  no primary on', body.slice(0,80)); await n.waitForTimeout(1500).catch(()=>{}); if (closed || n.isClosed()) return 'closed'; continue; }
      await primary.click({ force: true }).catch(()=>{});
      await n.waitForTimeout(1800).catch(()=>{});
    }
    return closed ? 'closed' : 'done';
  };

  const totalRounds = 0;
  for (let outer = 0; outer < 6; outer++) {
    const n = context.pages().find((p) => p.url().includes('notification'));
    if (!n) break;
    console.log('processing notification:', n.url());
    const res = await clickThrough(n);
    console.log('notification result:', res);
    // wait for potential new notification (SIWE sign after connect)
    for (let i = 0; i < 20; i++) {
      const next = context.pages().find((p) => p.url().includes('notification'));
      if (next && next !== n) { notif = next; break; }
      if (context.pages().filter((p) => p.url().includes('notification')).length === 0) break;
      await hub.waitForTimeout(600);
    }
  }

  await hub.waitForTimeout(3000);
  console.log('HUB AFTER:', ((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,250));
  console.log('pages:', context.pages().map(p=>p.url()).join(' | '));
  // session check
  try {
    const resp = await hub.request.get('http://localhost:3001/auth/session');
    console.log('session status:', resp.status(), (await resp.text()).slice(0,120));
  } catch(e) { console.log('session err', e.message.slice(0,80)); }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
