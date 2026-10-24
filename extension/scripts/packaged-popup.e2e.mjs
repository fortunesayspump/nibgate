import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const profile = await mkdtemp(join(tmpdir(), 'nibgate-extension-'));
const extensionPath = resolve('dist');
const extensionId = createHash('sha256').update(extensionPath).digest('hex').slice(0, 32)
  .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
let context;

async function assertKeyboardToggle(page, inputId) {
  const input = page.locator(`#${inputId}`);
  const button = page.locator(`[data-password-toggle="${inputId}"]`);
  await input.fill('FixturePassword123!');
  assert.equal(await input.getAttribute('type'), 'password');
  assert.equal(await button.getAttribute('aria-label'), 'Show password');
  await button.focus();
  await button.press('Space');
  assert.equal(await input.getAttribute('type'), 'text');
  assert.equal(await button.getAttribute('aria-label'), 'Hide password');
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await input.evaluate((node) => node === document.activeElement), true);
  await button.focus();
  await button.press('Enter');
  assert.equal(await input.getAttribute('type'), 'password');
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
}

try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.locator('#screen-onboard').waitFor({ state: 'visible' });

  await page.locator('#ob-create-btn').click();
  await assertKeyboardToggle(page, 'new-password');
  await page.locator('[data-password-toggle="new-password"]').click();
  assert.equal(await page.locator('#new-password').getAttribute('type'), 'text');
  await page.locator('#ob-create-back').click();
  await page.locator('#ob-create-btn').click();
  assert.equal(await page.locator('#new-password').getAttribute('type'), 'password');

  await page.locator('#ob-create-back').click();
  await page.locator('#ob-import-btn').click();
  await assertKeyboardToggle(page, 'imp-password');
  await page.locator('#ob-import-back').click();

  await page.locator('#ob-create-btn').click();
  await page.locator('#new-password').fill('FixturePassword123!');
  await page.locator('#do-create').click();
  await page.locator('#ob-backup').waitFor({ state: 'visible' });
  await page.locator('#ob-saved').check();
  await page.locator('#ob-done').click();
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.locator('#nav-settings').click();
  await page.locator('#sec-reveal').click();
  await assertKeyboardToggle(page, 'reveal-password');
  await page.locator('[data-password-toggle="reveal-password"]').click();
  await page.locator('#nav-home').click();
  await page.locator('#nav-settings').click();
  assert.equal(await page.locator('#reveal-password').getAttribute('type'), 'password');

  await page.locator('#sec-lock').click();
  await page.locator('#screen-lock').waitFor({ state: 'visible' });
  await assertKeyboardToggle(page, 'lock-password');
  await page.locator('#lock-forgot').click();
  await page.locator('#ob-recover').waitFor({ state: 'visible' });
  await assertKeyboardToggle(page, 'recover-password');
  await assertKeyboardToggle(page, 'recover-password-confirm');

  await page.locator('[data-password-toggle="recover-password"]').click();
  await page.screenshot({ path: resolve('e2e/screenshots/extension-1.2.1-password-toggle.png') });
  await page.locator('#recover-back').click();
  await page.locator('#lock-forgot').click();
  assert.equal(await page.locator('#recover-password').getAttribute('type'), 'password');
  assert.equal(await page.locator('#recover-password-confirm').getAttribute('type'), 'password');

  console.log('packaged popup: six password fields, keyboard/focus/ARIA, navigation reset — OK');
} finally {
  await context?.close();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
