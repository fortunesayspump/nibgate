const { chromium } = require('playwright');
const path = require('node:path');
const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = '/tmp/opencode/e2e/mm-profile';

async function launch() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
    timeout: 60000,
  });
  const start = Date.now(); let worker = null;
  while (Date.now() - start < 30000) { worker = context.serviceWorkers().find((w) => w.url().includes('service-worker.js')); if (worker) break; await new Promise((r) => setTimeout(r, 500)); }
  const extensionId = new URL(worker.url()).host;
  return { context, extensionId };
}

async function main() {
  const { context, extensionId } = await launch();
  const home = await context.newPage();
  home.setDefaultTimeout(10000);
  await home.goto(`chrome-extension://${extensionId}/home.html`, { timeout: 30000 });
  await home.waitForTimeout(3000);

  // unlock if locked
  const pw = home.locator('input[type="password"]').first();
  if (await pw.count()) {
    await pw.fill('TestWallet123!');
    await home.locator('[data-testid="unlock-submit"]').first().click();
    await home.waitForTimeout(2000);
  }

  // dismiss occasional passkey prompt
  const pl = home.locator('[data-testid="passkey-maybe-later-button"]').first();
  if (await pl.count()) { await pl.click(); await home.waitForTimeout(1500); }

  // finish any lingering onboarding screens
  for (let i = 0; i < 8; i++) {
    const b = home.locator(
      '[data-testid="recovery-phrase-continue"], [data-testid="recovery-phrase-remind-later"], [data-testid="metametrics-i-agree"], [data-testid="onboarding-complete-done"], [data-testid="passkey-maybe-later-button"]'
    ).first();
    if (await b.count()) { await b.click({ timeout: 5000 }).catch(()=>{}); await home.waitForTimeout(800); }
    else break;
  }

  // settings menu
  const menu = home.locator('[data-testid="account-menu-open-button"], [data-testid="global-menu"]').first();
  if (await menu.count()) { await menu.click(); await home.waitForTimeout(800); }
  const btns = home.locator('button');
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) console.log((tid||'') + ' :: ' + t);
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });