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
  // wait for connect button with retry
  let clicked = false;
  for (let i = 0; i < 10; i++) {
    const b = hub.locator('button:has-text("Connect wallet")').first();
    if (await b.count()) { await b.click(); clicked = true; break; }
    await hub.waitForTimeout(800);
  }
  if (!clicked) {
    console.log('connect button not found; body:', ((await hub.locator('body').innerText()||'').replace(/\s+/g,'|')).slice(0,300));
    await context.close(); process.exit(1);
  }
  await hub.waitForTimeout(2500);
  await hub.locator('w3m-modal button:has-text("MetaMask installed")').first().click();
  let notif = null;
  for (let i = 0; i < 30; i++) { notif = context.pages().find((p) => p.url().includes('notification')); if (notif) break; await hub.waitForTimeout(500); }
  if (!notif) { console.log('no notification'); await context.close(); process.exit(1); }
  await notif.waitForTimeout(1500);
  const dumpBody = async (label) => {
    console.log('---', label, '---');
    console.log(((await notif.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,250));
  };
  // Step 1 Connect
  const cbtn = notif.locator('[data-testid="confirm-btn"], button:has-text("Connect")').last();
  if (await cbtn.count()) { await cbtn.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(2000); }
  await dumpBody('after connect');
  // Step 2 loop: network add / switch
  for (let round = 0; round < 8; round++) {
    const body = ((await notif.locator('body').innerText().catch(()=>''))||'');
    const conf = notif.locator('[data-testid="confirm-footer-button"], button:has-text("Confirm"), button:has-text("Switch network"), [data-testid="confirm-btn"]').last();
    if ((body.includes('suggesting') || body.includes('network details') || body.includes('Switch network')) && await conf.count()) {
      console.log('round', round, 'confirming network'); await conf.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(2500); await dumpBody('after net round ' + round);
    } else break;
  }
  // Step 3 sign
  for (let round = 0; round < 8; round++) {
    const body = ((await notif.locator('body').innerText().catch(()=>''))||'');
    const sig = notif.locator('[data-testid="confirm-footer-button"], button:has-text("Sign"), button:has-text("Confirm")').last();
    if ((body.includes('reads as follows') || body.includes('personal_sign') || body.toLowerCase().includes('sign')) && await sig.count()) {
      console.log('round', round, 'signing'); await sig.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(2500); await dumpBody('after sign round ' + round);
    } else break;
  }
  console.log('HUB NOW:', ((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,250));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
