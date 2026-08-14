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
  await home.goto(`chrome-extension://${extensionId}/home.html`, { timeout: 30000 });
  await home.waitForTimeout(3000);

  const selects = home.locator('select');
  console.log('select count:', await selects.count());
  if (await selects.count()) {
    const optCount = await selects.first().locator('option').count();
    console.log('option count:', optCount);
    const firstOpt = await selects.first().locator('option').first().getAttribute('value').catch(() => '?');
    console.log('first option value:', firstOpt);
    const selected = await selects.first().inputValue().catch(() => '?');
    console.log('selected:', selected);
  }
  // lists
  const lis = home.locator('li').count();
  console.log('li count:', await lis);
  // what buttons visible in main flow
  const mainBtns = home.locator('main button, .onboarding-flow button, button');
  console.log('main buttons:', await mainBtns.count());
  for (let i = 0; i < Math.min(await mainBtns.count(), 10); i++) {
    console.log('  btn:', ((await mainBtns.nth(i).textContent().catch(()=>''))||'').trim().slice(0,40));
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });