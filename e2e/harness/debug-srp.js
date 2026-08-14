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

  // print all elements incl checkboxes, links, textareas
  const els = home.locator('button, input, a, textarea, [role="button"]');
  const n = await els.count();
  for (let i = 0; i < n; i++) {
    const el = els.nth(i);
    const t = ((await el.textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,60);
    const tid = await el.getAttribute('data-testid').catch(()=>null);
    const type = await el.getAttribute('type').catch(()=>null);
    const placeholder = await el.getAttribute('placeholder').catch(()=>null);
    console.log(`${el.toString()} type=${type||'-'} tid=${tid||'-'} ph=${placeholder||'-'} :: ${t}`.replace(/locator\(.*?\)/,'loc'));
  }
  const cbs = home.locator('input[type="checkbox"]');
  console.log('checkboxes:', await cbs.count());
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });