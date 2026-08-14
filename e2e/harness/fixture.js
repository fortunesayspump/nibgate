const { chromium } = require('playwright');
const path = require('node:path');

const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = '/tmp/opencode/e2e/mm-profile';

async function launch() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--disable-component-extensions-with-background-pages',
    ],
  });
  let worker = context.serviceWorkers().find((w) => w.url().includes('nkbihfbeogaeaoehlefnkodbefgpgknn'));
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extensionId = new URL(worker.url()).host;
  return { context, extensionId, worker };
}

async function main() {
  const { context, extensionId, worker } = await launch();
  console.log('extensionId:', extensionId);
  console.log('service worker URL:', worker.url());

  const home = await context.newPage();
  await home.goto(`chrome-extension://${extensionId}/home.html`);
  await home.waitForTimeout(2500);
  const title = await home.title();
  const bodyText = (await home.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' | ');
  console.log('MetaMask home title:', title);
  console.log('body:', bodyText);
  await context.close();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });