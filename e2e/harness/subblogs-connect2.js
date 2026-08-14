const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  for (const p of context.pages()) { if (!p.url().includes('localhost')) await p.close().catch(()=>{}); }
  const sub = await context.newPage();
  sub.setDefaultTimeout(20000);
  await sub.goto('http://localhost:3002/video/synthesizer-comparison', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sub.waitForTimeout(4000);
  // list all buttons with enabled state
  const btns = sub.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,30);
    const dis = await btns.nth(i).isDisabled().catch(()=>true);
    if (t) list.push(i + '::' + t + (dis?'(dis)':''));
  }
  console.log('buttons:', list.join(' | '));
  // click the enabled connect button (not the disabled hold-to-pay)
  const connectBtn = sub.locator('button:has-text("Connect wallet")').first();
  const holdBtn = sub.locator('button:has-text("Hold to pay")').first();
  if (await connectBtn.count() && !(await connectBtn.isDisabled().catch(()=>true))) {
    await connectBtn.click();
  } else if (await holdBtn.count() && !(await holdBtn.isDisabled().catch(()=>true))) {
    await holdBtn.click();
  } else {
    console.log('nothing clickable');
  }
  await sub.waitForTimeout(2500);
  const mmOpt = sub.locator('w3m-modal button:has-text("MetaMask installed")').first();
  if (await mmOpt.count()) { await mmOpt.click(); console.log('clicked MetaMask'); }
  for (let outer = 0; outer < 5; outer++) {
    let notif = null;
    for (let i = 0; i < 25; i++) { notif = context.pages().find((p) => p.url().includes('notification')); if (notif) break; await sub.waitForTimeout(500); }
    if (!notif) break;
    console.log('notification:', notif.url());
    let closed = false;
    notif.once('close', () => { closed = true; });
    for (let round = 0; round < 10; round++) {
      if (closed || notif.isClosed()) break;
      const primary = notif.locator('[data-testid="confirm-footer-button"], [data-testid="confirm-btn"]').last();
      if (await primary.count().catch(()=>0)) { await primary.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(1800).catch(()=>{}); }
      else { await notif.waitForTimeout(1200).catch(()=>{}); }
    }
    await sub.waitForTimeout(1500);
  }
  await sub.waitForTimeout(3000);
  console.log('SUB AFTER:', ((await sub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,300));
  const cookies = await context.cookies('http://localhost:3002');
  console.log('sub cookies:', cookies.map(c=>c.name).join(','));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
