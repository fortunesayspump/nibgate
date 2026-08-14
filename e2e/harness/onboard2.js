const { chromium } = require('playwright');
const path = require('node:path');

const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = '/tmp/opencode/e2e/mm-profile';
const PASSWORD = 'TestWallet123!';

async function launch() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
    timeout: 60000,
  });
  const worker = await (async () => {
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const w = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
      if (w) return w;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  })();
  if (!worker) throw new Error('worker missing');
  return { context, extensionId: new URL(worker.url()).host };
}

async function step(page, label, fn) {
  try { await fn(); console.log('OK  ', label); }
  catch (e) { console.log('STEP-FAIL', label, '::', e.message.slice(0, 120)); }
}

async function body(page) {
  return (await page.locator('body').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 200);
}

async function main() {
  const { context, extensionId } = await launch();
  const home = await context.newPage();
  await home.goto(`chrome-extension://${extensionId}/home.html`, { timeout: 30000 });
  await home.waitForTimeout(3000);
  console.log('start:', await body(home));

  // language: pick English
  await step(home, 'language English', async () => {
    const en = home.getByText('English', { exact: true }).first();
    if (await en.count()) await en.click();
    await home.waitForTimeout(500);
    const cont = home.locator('button:has-text("Continue"), button:has-text("Select"), button:has-text("Next")').first();
    if (await cont.count()) await cont.click();
    await home.waitForTimeout(800);
  });
  console.log('after lang:', await body(home));

  // import wallet (create fresh, then add pk later)
  await step(home, 'create wallet', async () => {
    const b = home.locator('[data-testid="onboarding-create-wallet"]').first();
    if (await b.count()) { await b.click(); await home.waitForTimeout(800); }
  });
  console.log('after create:', await body(home));

  await step(home, 'accept TOS', async () => {
    const cbs = home.locator('input[type="checkbox"]');
    const n = await cbs.count();
    console.log('   tos checkboxes:', n);
    for (let i = 0; i < n; i++) {
      if (!(await cbs.nth(i).isChecked().catch(() => true))) await cbs.nth(i).check().catch(() => {});
    }
    const agree = home.locator('[data-testid="onboarding-terms-of-use-button"], button:has-text("I agree"), button:has-text("Agree")').first();
    if (await agree.count()) { await agree.click(); await home.waitForTimeout(800); }
  });
  console.log('after tos:', await body(home));

  await step(home, 'password', async () => {
    const pw = home.locator('[data-testid="create-password-new"]').first();
    if (await pw.count()) {
      await pw.fill(PASSWORD);
      await home.locator('[data-testid="create-password-confirm"]').first().fill(PASSWORD);
      const terms = home.locator('[data-testid="create-password-terms"], input[type="checkbox"]').first();
      if (await terms.count()) await terms.check().catch(() => {});
      const go = home.locator('[data-testid="create-password-welcome-button"], button:has-text("Create")').first();
      if (await go.count()) await go.click();
      await home.waitForTimeout(1200);
    }
  });
  console.log('after password:', await body(home));

  await step(home, 'SRP reveal skip', async () => {
    for (const t of ['onboarding-secure-wallet-skip', "I'll risk it", 'Skip', 'Not now']) {
      const loc = home.locator(`[data-testid="${t}"], button:has-text("${t}")`).first();
      if (await loc.count()) { await loc.click().catch(() => {}); await home.waitForTimeout(800); break; }
    }
  });
  console.log('after srp:', await body(home));

  console.log('FINAL:', await body(home));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });