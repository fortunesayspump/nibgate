const { chromium } = require('playwright');
const path = require('node:path');
const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = process.env.MM_PROFILE || '/tmp/opencode/e2e/mm-profile';

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
    timeout: 60000,
  });
  context.serviceWorkers().forEach((w) => console.log('existing worker:', w.url()));
  const all = await context.waitForEvent('serviceworker', { timeout: 45000 }).catch((e) => { console.log('waitForEvent err:', e.message.slice(0,80)); return null; });
  if (all) console.log('new worker:', all.url());
  const now = context.serviceWorkers();
  console.log('total workers now:', now.length);
  now.forEach((w) => console.log('  -', w.url()));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });