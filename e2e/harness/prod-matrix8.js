// Round 8: broad frontend smoke (main app + subblog) — console errors + page state.
const { install, bodyText, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');
const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix8.log';
function log(s) { const line = `${new Date().toISOString()} ${s}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch {} }
const SEP = '='.repeat(72);

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  await install({ page, pk: SEL_PK });

  const targets = [
    ['home', 'https://nibgate.xyz/'],
    ['share-seller', 'https://nibgate.xyz/share'],
    ['hub-blog', 'https://nibgate.xyz/blog'],
    ['free-post-anon', 'https://nibgate.xyz/ns/4xtUB8ZP'],
    ['paid-post-anon', 'https://nibgate.xyz/ns/dR21SdTL'],
    ['dashboard', 'https://nibgate.xyz/dashboard'],
    ['subblog-premium', 'https://catwalk.nibgate.xyz/docs/lookbook-materials-d14'],
    ['subblog-home', 'https://catwalk.nibgate.xyz/'],
  ];

  for (const [name, url] of targets) {
    const errs = [];
    const handler = (m) => {
      const t = m.text();
      if (m.type() === 'error' && !/Analytics|ERR_NAME_NOT_RESOLVED|Failed to load resource|net::/.test(t)) errs.push(t.slice(0, 220));
    };
    page.on('console', handler);
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 45000 });
      await page.waitForTimeout(3600);
      const b = await bodyText(page);
      const has500 = /Internal Server Error|Application error|error boundary|Oops|Something went wrong/i.test(b);
      log(`[${name}] status-ok | title-ish: ${b.slice(0, 140).replace(/\n/g, ' ')}`);
      log(`[${name}] errBoundary=${has500} consoleErrors=${errs.length}${errs.length ? ' :: ' + errs.join(' | ').slice(0, 260) : ''}`);
    } catch (e) {
      log(`[${name}] NAV-FAIL ${e.message.slice(0, 140)}`);
    }
    page.removeListener('console', handler);
  }
  await browser.close();
  log('done.');
}
main().catch((e) => { try { fs.appendFileSync(LOG, '\nFATAL: ' + e + '\n'); } catch {} process.exit(1); });