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
  const home = await context.newPage();
  home.setDefaultTimeout(10000);
  await home.goto(`chrome-extension://${extensionId}/home.html`, { timeout: 30000 });
  await home.waitForTimeout(3000);

  const pw = home.locator('input[type="password"]').first();
  if (await pw.count()) {
    await pw.fill('TestWallet123!');
    await home.locator('[data-testid="unlock-submit"]').first().click();
    await home.waitForTimeout(2000);
  }

  const dumpState = async (label) => {
    await home.waitForTimeout(600);
    const btns = home.locator('button');
    const list = [];
    const nb = await btns.count();
    for (let i = 0; i < nb; i++) {
      const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
      const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
      if (t || tid) list.push((tid||'') + ' :: ' + t);
    }
    console.log('--- ' + label + ' ---');
    console.log(list.slice(0,20).join('\n'));
  };

  for (let round = 0; round < 10; round++) {
    await dumpState('round ' + round);
    let clicked = false;
    // try in this priority: maybe-later, continue, remind-later, agree, done, open wallet
    for (const tid of ['passkey-maybe-later-button','recovery-phrase-remind-later','recovery-phrase-continue','metametrics-i-agree','onboarding-complete-done']) {
      const b = home.locator(`[data-testid="${tid}"]`).first();
      if (await b.count()) { await b.click({ timeout: 5000, force: true }).catch((e) => console.log('  click err', e.message.slice(0,50))); clicked = true; break; }
    }
    if (!clicked) { console.log('nothing to click — stopping'); break; }
  }
  await dumpState('FINAL');
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });