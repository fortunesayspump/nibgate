const { chromium } = require('playwright');
const path = require('node:path');
const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = '/tmp/opencode/e2e/mm-profile';

async function waitForWorker(context, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const w = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    if (w) return w;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function launch() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
    timeout: 60000,
  });
  const worker = await waitForWorker(context);
  if (!worker) throw new Error('MetaMask service worker never appeared');
  const extensionId = new URL(worker.url()).host;
  return { context, extensionId };
}

async function main() {
  const { context, extensionId } = await launch();
  const home = await context.newPage();
  await home.goto(`chrome-extension://${extensionId}/home.html`, { timeout: 30000 });
  await home.waitForTimeout(4000);
  await home.screenshot({ path: 's0.png' });
  const text = (await home.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
  console.log('s0 |', text);
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });