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
  home.setDefaultTimeout(8000);
  await home.goto(`chrome-extension://${extensionId}/home.html`, { timeout: 30000 });
  await home.waitForTimeout(2500);

  const state = async (label) => {
    await home.waitForTimeout(700);
    const btns = home.locator('button');
    const n = await btns.count();
    const list = [];
    for (let i = 0; i < n; i++) {
      const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,50);
      const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
      if (t || tid) list.push((tid||'') + ' :: ' + t);
    }
    console.log('--- ' + label + ' ---');
    console.log(list.slice(0,30).join('\n'));
  };

  await state('initial');

  // click create wallet
  await home.locator('[data-testid="onboarding-create-wallet"]').click();
  await state('after create-wallet');

  // v13 shows social signup; choose classic SRP flow
  const srpBtn = home.locator('[data-testid="onboarding-create-with-srp-button"], button:has-text("Use Secret Recovery Phrase")').first();
  if (await srpBtn.count()) { await srpBtn.click(); await state('after srp-flow'); }

  const cbs = home.locator('input[type="checkbox"]');
  console.log('checkboxes:', await cbs.count());
  if (await cbs.count()) {
    for (let i = 0; i < await cbs.count(); i++) {
      const checked = await cbs.nth(i).isChecked().catch(()=>false);
      if (!checked) await cbs.nth(i).check().catch(()=>{});
    }
    await state('after checkboxes');
  }
  const agree = home.locator('[data-testid="onboarding-terms-of-use-button"], button:has-text("I agree")').first();
  if (await agree.count()) { await agree.click(); await state('after agree'); }

  const pw = home.locator('input[type="password"]');
  console.log('password field count:', await pw.count());
  if (await pw.count() >= 2) {
    await pw.nth(0).fill('TestWallet123!');
    await pw.nth(1).fill('TestWallet123!');
    const terms = home.locator('input[type="checkbox"]');
    if (await terms.count()) await terms.nth(0).check({ force: true }).catch(()=>{});
    await state('before create-submit');
    const go = home.locator('[data-testid="create-password-submit"]').first();
    if (await go.count()) { await go.click({ timeout: 8000 }).catch(()=>{}); await state('after submit'); }
  }
  await home.waitForTimeout(1500);
  // passkey prompt -> maybe later
  const maybeLater = home.locator('[data-testid="passkey-maybe-later-button"]').first();
  if (await maybeLater.count()) { await maybeLater.click(); await state('after passkey'); }

  // SRP reveal -> continue -> remind-me-later / skip backup
  const recCont = home.locator('[data-testid="recovery-phrase-continue"], [data-testid="onboarding-secure-wallet-continue"]').first();
  if (await recCont.count()) { await recCont.click({ timeout: 8000 }).catch(()=>{}); await state('after rec continue'); }
  // on second reveal page: "I've saved it" / remind later
  const saved = home.locator('[data-testid="recovery-phrase-saved-button"], button:has-text("saved it"), button:has-text("Made sure of it")').first();
  if (await saved.count()) { await saved.click({ timeout: 5000 }).catch(()=>{}); await state('after saved'); }
  const skip2 = home.locator('[data-testid="onboarding-secure-wallet-skip"], [data-testid="recovery-phrase-remind-later"]').first();
  if (await skip2.count()) { await skip2.click({ timeout: 5000 }).catch(()=>{}); await state('after skip2'); }
  // possible "Skip" / "Not now"
  const nn = home.locator('button:has-text("Skip"), button:has-text("Not now"), button:has-text("I\'ll risk it")').first();
  if (await nn.count()) { await nn.click({ timeout: 3000 }).catch(()=>{}); await state('after notnow'); }
  try { const mm = home.locator('[data-testid="metametrics-i-agree"]').first(); if (await mm.count()) { await mm.click({ timeout: 8000 }).catch(()=>{}); await state('after metametrics'); } } catch (e) { console.log('mm err', e.message.slice(0,60)); }
  await home.waitForTimeout(1500);
  await state('FINAL');

  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });