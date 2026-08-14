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
  if (await pw.count()) { await pw.fill('TestWallet123!'); await home.locator('[data-testid="unlock-submit"]').first().click(); await home.waitForTimeout(2000); }
  const pl = home.locator('[data-testid="passkey-maybe-later-button"]').first();
  if (await pl.count()) { await pl.click(); await home.waitForTimeout(1500); }
  const cont = home.locator('[data-testid="recovery-phrase-continue"]').first();
  if (await cont.count()) {
    console.log('continue disabled attr:', await cont.getAttribute('disabled'));
    const aria = await cont.getAttribute('aria-disabled');
    console.log('aria-disabled:', aria);
    console.log('class:', await cont.getAttribute('class'));
  }
  // look for any word-chip / clickable spans near phrase
  const chips = home.locator('[class*="chip" i], [class*="word" i], [class*="phrase" i]');
  console.log('chip-ish count:', await chips.count());
  // all text content of body but only visible region maybe. Print main content text
  const mainTxt = (await home.locator('main, .onboarding-flow').first().innerText().catch(()=>'')).replace(/\n+/g,' | ').slice(0,400);
  console.log('main text:', mainTxt);
  await context.close(); process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
