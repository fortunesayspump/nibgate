const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  // open notification page directly; if there's a pending request, reject/cancel it
  const notif = await context.newPage();
  notif.setDefaultTimeout(8000);
  await notif.goto(`chrome-extension://${extensionId}/notification.html`, { timeout: 20000 });
  await notif.waitForTimeout(2500);
  const pw = notif.locator('input[type="password"]').first();
  if (await pw.count()) { await pw.fill(mm.PASSWORD); await notif.locator('[data-testid="unlock-submit"]').first().click({ force: true }).catch(()=>{}); await notif.waitForTimeout(2000); }
  const body = (await notif.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,200);
  console.log('notification body:', body || '(empty)');
  if (body) {
    console.log('pending request; attempting cancel/reject-all');
    const cancel = notif.locator('[data-testid="cancel-btn"], [data-testid="confirm-footer-cancel-button"], [data-testid="confirm-nav__reject-all"]').first();
    if (await cancel.count()) { await cancel.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(1200); }
    const body2 = (await notif.locator('body').innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,200);
    console.log('after cancel:', body2 || '(empty)');
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
