// probe: paid subblog premium doc page — full body + network for the 402 source.
const { install, bodyText } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');
const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix9.log';
function log(s) { const line = `${new Date().toISOString()} ${s}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch {} }

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.on('console', (m) => { const t = m.text(); if (/error|fail/i.test(t)) log(`[console:${m.type()}] ${t.slice(0, 240)}`); });
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.status() !== 404) { const u = r.url(); if (/api|content|access|unlock|media|nibshare/.test(u)) log(`[http ${r.status()}] ${r.request().method()} ${u.slice(0, 160)}`); }
  });
  await page.goto('https://catwalk.nibgate.xyz/docs/lookbook-materials-d14', { waitUntil: 'commit', timeout: 45000 });
  await page.waitForTimeout(5000);
  const b = await bodyText(page);
  log(`--- FULL BODY (first 2200) ---`);
  log(b.slice(0, 2200).replace(/\n+/g, ' | '));
  await browser.close();
  log('done.');
})().catch((e) => { try { fs.appendFileSync(LOG, '\nFATAL: ' + e + '\n'); } catch {} process.exit(1); });