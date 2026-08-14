const { chromium } = require('playwright');
const path = require('node:path');

const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = process.env.MM_PROFILE || '/tmp/opencode/e2e/mm-profile';

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
  });
  let worker = context.serviceWorkers().find((w) => w.url().includes('nkbihfbeogaeaoehlefnkodbefgpgknn'));
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extensionId = new URL(worker.url()).host;
  console.log('extensionId:', extensionId);

  const home = await context.newPage();
  await home.goto(`chrome-extension://${extensionId}/home.html`);
  await home.waitForTimeout(3000);
  const els = home.locator('button, [role="button"], input, a');
  const n = await els.count();
  console.log('--- interactive elements (' + n + ') ---');
  for (let i = 0; i < Math.min(n, 80); i++) {
    const el = els.nth(i);
    const t = ((await el.textContent().catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const id = await el.getAttribute('data-testid').catch(() => null);
    const tag = await el.evaluate((e) => e.tagName + (e.getAttribute('type') ? `[type=${e.getAttribute('type')}]` : '')).catch(() => '?');
    console.log(`${tag} testid=${id || '—'} :: ${t}`);
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });