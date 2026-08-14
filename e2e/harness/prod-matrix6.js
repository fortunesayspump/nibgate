// Round 6: correct mine parse (draft persistence) + banned-buyer quote + banned-buyer gate UI.
const { install, connectSellerFlow, bodyText, BUY_PK, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');

const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix6.log';
const API = 'https://api.nibgate.xyz';
const BUYER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const SEP = '='.repeat(72);
function log(s) { const line = `${new Date().toISOString()} ${s}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch {} }

async function launch(pk = SEL_PK) {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(40000);
  await install({ page, pk });
  return { browser, context, page };
}
async function goto(page, url) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(url, { waitUntil: 'commit', timeout: 40000 }); await page.waitForTimeout(2200); return true; }
    catch (e) { await page.waitForTimeout(2000); }
  }
  return false;
}
async function sellerConnect(page) {
  await goto(page, 'https://nibgate.xyz/share');
  for (let i = 0; i < 2; i++) {
    try { await connectSellerFlow(page, { label: 'x', log: () => {} }); break; }
    catch (e) { await page.waitForTimeout(2000); await goto(page, 'https://nibgate.xyz/share'); }
  }
  await page.waitForTimeout(1500);
  return (await page.getByPlaceholder(/Post title/).count()) > 0;
}

(async () => {
  log('start matrix6');

  log(`${SEP}\n## MINE (seller) — draft persistence`);
  {
    const { browser, page, context } = await launch(SEL_PK);
    await sellerConnect(page);
    const api = context.request;
    const r = await api.get(`${API}/nibshare/mine`);
    const j = await r.json().catch(() => ({}));
    const shares = Array.isArray(j.shares) ? j.shares : [];
    const drafts = shares.filter((s) => /E2E Matrix Draft/.test(s.title || ''));
    log(`mine=${r.status()} shares=${shares.length}`);
    for (const s of shares.slice(0, 12)) log(`  share: "${s.title}" status=${s.status} slug=${s.slug} price=${s.price} expires=${s.expiresAt ? new Date(s.expiresAt).toISOString() : 'never'}`);
    log(`draftsFound=${drafts.length ? drafts.map((d) => `${d.title}(${d.status})`).join(' | ') : 'NONE — Save-as-draft created nothing'}`);
    await browser.close();
  }

  log(`${SEP}\n## BANNED-BUYER QUOTE (dR21SdTL after ban)`);
  {
    const { browser, page, context } = await launch(SEL_PK);
    const api = context.request;
    await sellerConnect(page);
    const b = await api.post(`${API}/nibshare/dR21SdTL/entitlements/${BUYER}/ban`);
    log(`[ban] ${b.status()} ${(await b.text()).slice(0, 120)}`);
    const q = await api.get(`${API}/nibshare/dR21SdTL/quote?wallet=${BUYER}`);
    log(`quote=${q.status()} ${(await q.text()).slice(0, 220)}`);
    const a = await api.get(`${API}/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    log(`access=${a.status()} ${(await a.text()).slice(0, 200)}`);
    await api.delete(`${API}/nibshare/dR21SdTL/entitlements/${BUYER}`);
    log(`restored`);
    await browser.close();
  }

  log(`${SEP}\n## BANNED-BUYER GATE UI (dR21SdTL)`);
  {
    const { browser, page } = await launch(BUY_PK);
    page.on('response', async (res) => { if (res.url().includes('/quote')) log(`[gate:banned] QUOTE ${res.status()} ${(await res.text().catch(() => '')).slice(0, 200)}`); });
    await goto(page, 'https://nibgate.xyz/ns/dR21SdTL');
    for (let i = 0; i < 5; i++) {
      const b = await bodyText(page);
      if (/banned|not allowed|blocked/i.test(b)) break;
      if (/0x3C44/i.test(b)) break;
      if (b.includes('Connect wallet')) {
        await page.getByText(/connect wallet/i).first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
      } else if (b.includes('Sign the message') && (await page.getByRole('button', { name: /sign with wallet/i }).count())) {
        await page.getByRole('button', { name: /sign with wallet/i }).click({ force: true }).catch(() => {});
        await page.waitForTimeout(2500);
      }
      await page.waitForTimeout(1500);
    }
    log(`[gate:banned] FINAL: ${(await bodyText(page)).slice(0, 380)}`);
    await browser.close();
  }

  log('done.');
})().catch((e) => { try { fs.appendFileSync(LOG, '\nFATAL: ' + e + '\n'); } catch {} process.exit(1); });