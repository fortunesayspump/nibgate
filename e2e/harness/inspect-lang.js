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

  const dump = await (async () => {
    const out = [];
    const els = home.locator('div, button, li, span, input, svg, [role="option"], [role="button"]');
    const n = await els.count();
    for (let i = 0; i < n; i++) {
      const el = els.nth(i);
      const tag = await el.evaluate((e) => e.tagName).catch(() => '?');
      const role = await el.getAttribute('role').catch(() => null);
      const tid = await el.getAttribute('data-testid').catch(() => null);
      const txt = ((await el.textContent().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (role || tid || txt === 'English' || txt === 'Continue') {
        out.push(`${tag} role=${role || '—'} tid=${tid || '—'} :: ${txt}`);
      }
    }
    return out.slice(0, 100);
  })();
  console.log(dump.join('\n'));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });