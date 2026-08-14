const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = '/tmp/opencode/e2e/mm-profile';

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
  });
  let worker = context.serviceWorkers().find((w) => w.url().includes('nkbihfbeogaeaoehlefnkodbefgpgknn'));
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extensionId = new URL(worker.url()).host;
  const home = await context.newPage();
  await home.goto(`chrome-extension://${extensionId}/home.html`);
  await home.waitForTimeout(4000);
  const dump = async (label) => {
    await home.screenshot({ path: `${label}.png` });
    const text = (await home.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    console.log(label, '|', text);
  };
  await dump('s0');
  return { context, home };
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });