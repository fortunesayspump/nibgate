const { chromium } = require('playwright');
const path = require('node:path');
const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = '/tmp/opencode/e2e/mm-profile';
async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
    timeout: 60000,
  });
  const start = Date.now(); let worker = null;
  while (Date.now() - start < 30000) { worker = context.serviceWorkers().find((w) => w.url().includes('service-worker.js')); if (worker) break; await new Promise((r) => setTimeout(r, 500)); }
  const extensionId = new URL(worker.url()).host;
  const notif = await context.newPage();
  notif.setDefaultTimeout(10000);
  await notif.goto(`chrome-extension://${extensionId}/notification.html`, { timeout: 30000 });
  await notif.waitForTimeout(3000);
  const pw = notif.locator('input[type="password"]').first();
  if (await pw.count()) { await pw.fill('TestWallet123!'); await notif.locator('[data-testid="unlock-submit"]').first().click(); await notif.waitForTimeout(2000); }
  const dumpBtns = async (label) => {
    const btns = notif.locator('button'); const nb = await btns.count(); const list = [];
    for (let i = 0; i < nb; i++) {
      const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
      const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
      if (t || tid) list.push((tid||'') + ' :: ' + t);
    }
    console.log('---', label, '---'); console.log(list.join('\n') || '(no buttons)');
  };
  await dumpBtns('notif start');
  for (const tid of ['onboarding-complete-done','passkey-maybe-later-button']) {
    const b = notif.locator(`[data-testid="${tid}"]`).first();
    if (await b.count()) { await b.click({ force: true }).catch(()=>{}); await notif.waitForTimeout(1500); await dumpBtns('after ' + tid); }
  }
  await context.close(); process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
