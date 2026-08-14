// Round 7: hold ban ACTIVE during gate UI view (dR21SdTL) then restore.
const { install, connectSellerFlow, bodyText, BUY_PK, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');
const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix7.log';
const API = 'https://api.nibgate.xyz';
const BUYER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const SEP = '='.repeat(72);
function log(s) { const line = `${new Date().toISOString()} ${s}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch {} }
async function launch(pk = SEL_PK) {
  const b = await chromium.launch({ headless: true, channel: 'chromium' });
  const c = await b.newContext({ viewport: { width: 1440, height: 1100 } });
  const p = await c.newPage();
  p.setDefaultTimeout(40000);
  await install({ page: p, pk });
  return { browser: b, context: c, page: p };
}
async function goto(page, url) {
  for (let i = 0; i < 3; i++) { try { await page.goto(url, { waitUntil: 'commit', timeout: 40000 }); await page.waitForTimeout(2200); return true; } catch { await page.waitForTimeout(2000); } }
  return false;
}
async function sellerConnect(page) {
  await goto(page, 'https://nibgate.xyz/share');
  for (let i = 0; i < 2; i++) { try { await connectSellerFlow(page, { label: 'x', log: () => {} }); break; } catch { await goto(page, 'https://nibgate.xyz/share'); } }
  await page.waitForTimeout(1500);
}

(async () => {
  log('start matrix7');
  // seller bans buyer
  const ban = await (async () => {
    const { browser, page, context } = await launch(SEL_PK);
    await sellerConnect(page);
    const api = context.request;
    const r = await api.post(`${API}/api/nibshare/dR21SdTL/entitlements/${BUYER}/ban`);
    log(`[ban] ${r.status()} ${(await r.text()).slice(0, 120)}`);
    await browser.close();
  })();

  // buyer opens gate while banned
  log(`${SEP}\n## BANNED-BUYER GATE UI (hold banned)`);
  const { browser, page } = await launch(BUY_PK);
  page.on('response', async (res) => { if (res.url().includes('/quote')) log(`[gate:banned] QUOTE ${res.status()} ${(await res.text().catch(() => '')).slice(0, 230)}`); });
  await goto(page, 'https://nibgate.xyz/ns/dR21SdTL');
  for (let i = 0; i < 6; i++) {
    const b = await bodyText(page);
    if (/banned|not allowed|blocked|restricted/i.test(b) && !/You're on the whitelist/i.test(b)) break;
    if (/0x3C44/i.test(b) && !/Checking/i.test(b)) break;
    if (b.includes('Connect wallet')) { await page.getByText(/connect wallet/i).first().click({ force: true }).catch(() => {}); await page.waitForTimeout(2000); }
    else if (b.includes('Sign the message')) { await page.getByRole('button', { name: /sign with wallet/i }).click({ force: true }).catch(() => {}); await page.waitForTimeout(2500); }
    await page.waitForTimeout(1500);
  }
  log(`[gate:banned] FINAL: ${(await bodyText(page)).slice(0, 420)}`);
  await browser.close();

  // restore
  const rstr = await (async () => {
    const { browser, page, context } = await launch(SEL_PK);
    await sellerConnect(page);
    const r = await context.request.delete(`${API}/api/nibshare/dR21SdTL/entitlements/${BUYER}`);
    log(`[restore] ${r.status()} ${(await r.text()).slice(0, 120)}`);
    await browser.close();
  })();
  log('done.');
})().catch((e) => { try { fs.appendFileSync(LOG, '\nFATAL: ' + e + '\n'); } catch {} process.exit(1); });