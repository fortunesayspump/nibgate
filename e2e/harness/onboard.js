const { chromium } = require('playwright');
const path = require('node:path');

const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = '/tmp/opencode/e2e/mm-profile';
const TEST_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // 0x7099...79c8
const PASSWORD = 'TestWallet123!';

async function launch() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
  });
  let worker = context.serviceWorkers().find((w) => w.url().includes('nkbihfbeogaeaoehlefnkodbefgpgknn'));
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extensionId = new URL(worker.url()).host;
  return { context, extensionId };
}

async function click(page, testid, fallbackText) {
  if (testid) {
    const loc = page.locator(`[data-testid="${testid}"]`);
    if (await loc.count()) { await loc.first().click(); return; }
  }
  if (fallbackText) {
    const loc = page.getByText(fallbackText, { exact: false }).first();
    await loc.click();
  }
}

async function main() {
  const { context, extensionId } = await launch();
  const home = await context.newPage();
  await home.goto(`chrome-extension://${extensionId}/home.html`);
  await home.waitForTimeout(2500);

  // handle language selector if present
  const english = home.getByText('English', { exact: true }).first();
  if (await english.count()) { await english.click().catch(() => {}); await home.waitForTimeout(500); }
  const cont = home.locator('button:has-text("Continue"), button:has-text("Select")').first();
  if (await cont.count()) { await cont.click().catch(() => {}); await home.waitForTimeout(800); }

  // fresh profile? check onboarding
  const onboardingVisible = (await home.locator('[data-testid="onboarding-import-wallet"]').count()) > 0;
  console.log('onboarding visible:', onboardingVisible);

  // click through: import wallet
  await click(home, 'onboarding-import-wallet');
  await home.waitForTimeout(800);
  // accept TOS checkboxes
  const checkboxes = home.locator('input[type="checkbox"]');
  const n = await checkboxes.count();
  console.log('tos checkboxes:', n);
  for (let i = 0; i < n; i++) {
    if (!(await checkboxes.nth(i).isChecked())) await checkboxes.nth(i).check();
  }
  await click(home, 'onboarding-terms-of-use-button', 'I agree');
  await home.waitForTimeout(800);
  // create fresh wallet (generate phrase) or import? We import later by pk; create fresh now
  const importVisible = (await home.locator('[data-testid="onboarding-create-wallet"]').count()) > 0;
  if (importVisible) await click(home, 'onboarding-create-wallet');
  await home.waitForTimeout(800);

  // password fields
  const pw = home.locator('[data-testid="create-password-new"]');
  if (await pw.count()) {
    await pw.fill(PASSWORD);
    await home.locator('[data-testid="create-password-confirm"]').fill(PASSWORD);
    await home.locator('[data-testid="create-password-terms"]').check();
    await home.locator('[data-testid="create-password-welcome-button"], button:has-text("Create")').first().click();
    await home.waitForTimeout(1200);
  }
  await home.screenshot({ path: 'onboard-1.png' });

  // possible SRP reveal + skip-backup buttons
  for (const t of ['onboarding-secure-wallet-skip', 'I\'ll risk it', 'Skip']) {
    const loc = home.locator(`[data-testid="${t}"], button:has-text("${t}")`).first();
    if (await loc.count()) { await loc.click().catch(() => {}); await home.waitForTimeout(800); break; }
  }
  await home.screenshot({ path: 'onboard-2.png' });
  console.log('after onboarding body snippet:');
  console.log((await home.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 300));

  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });