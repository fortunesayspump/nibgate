// Round 3: custom-tier buyer-connected UI, ban on paid post, expired-via-future, draft create trace.
const { install, bodyText, BUY_PK, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');

const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix3.log';
const API = 'https://api.nibgate.xyz';
const BUYER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const SEP = '='.repeat(72);

function log(s) { const line = `${new Date().toISOString()} ${s}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch {} }
function block(t) { log(`${SEP}\n## ${t}`); }

async function launch(pk = SEL_PK) {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  await install({ page, pk });
  return { browser, context, page };
}
async function goto(page, url) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(url, { waitUntil: 'commit', timeout: 45000 }); await page.waitForTimeout(2400); return true; }
    catch (e) { await page.waitForTimeout(2500); }
  }
  return false;
}
async function sellerAuthed(page) {
  await page.waitForTimeout(2000);
  if (await page.getByRole('button', { name: /sign with wallet/i }).count()) {
    await page.getByRole('button', { name: /sign with wallet/i }).click();
    await page.waitForTimeout(3200);
  }
  return true;
}

(async () => {
  log(`start matrix3 pid=${process.pid}`);

  block('CUSTOM-TIER GATE UI (buyer 0x3C44 connected, ddLEPvxv)');
  {
    const { browser, page } = await launch(BUY_PK);
    await goto(page, 'https://nibgate.xyz/ns/ddLEPvxv');
    for (let i = 0; i < 3; i++) {
      const b = await bodyText(page);
      log(`[custom] try${i + 1} gate: ${b.slice(0, 340)}`);
      log(`[custom] shows discounted 2 USDC: ${b.includes('2 USDC')} | whitelist banner: ${/whitelist/i.test(b)} | full 12 shows: ${b.includes('12 USDC')}`);
      await page.reload({ waitUntil: 'commit' });
      await page.waitForTimeout(2400);
    }
    await browser.close();
  }

  block('BAN ON PAID POST (dR21SdTL) + restore');
  {
    const { browser, page, context } = await launch(SEL_PK);
    await goto(page, 'https://nibgate.xyz/share');
    await sellerAuthed(page);
    const api = context.request;
    let r = await api.post(`${API}/api/nibshare/dR21SdTL/entitlements/${BUYER}/ban`);
    log(`[ban-paid] ban=${r.status()} ${(await r.text()).slice(0, 130)}`);
    r = await api.get(`${API}/api/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    log(`[ban-paid] buyer access=${r.status()} ${(await r.text()).slice(0, 170)}`);
    r = await api.delete(`${API}/api/nibshare/dR21SdTL/entitlements/${BUYER}`);
    log(`[ban-paid] restore=${r.status()} ${(await r.text()).slice(0, 130)}`);
    r = await api.get(`${API}/api/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    log(`[ban-paid] after-restore access=${r.status()} ${(await r.text()).slice(0, 170)}`);
    await browser.close();
  }

  block('EXPIRED SHARE (create now+6s, wait 11s, then view)');
  {
    const { browser, page, context } = await launch(SEL_PK);
    await goto(page, 'https://nibgate.xyz/share');
    await sellerAuthed(page);
    const api = context.request;
    const res = await api.post(`${API}/api/nibshare`, { data: {
      title: 'E2E Matrix Expiring', summary: 'expires shortly', contentType: 'article',
      content: 'body for expiring test', price: '3', status: 'active',
      expiresAt: new Date(Date.now() + 6000).toISOString(),
      whitelist: [], whitelistPrice: null, publicAccess: true,
    } });
    const j = await res.json().catch(() => ({}));
    const slug = j.slug || '';
    log(`[expired] create=${res.status()} slug=${slug} err=${j.error || 'none'}`);
    if (slug) {
      await page.waitForTimeout(11000);
      const acc = await api.get(`${API}/api/nibshare/${slug}/access?wallet=${BUYER}`);
      log(`[expired] access-after-expiry=${acc.status()} ${(await acc.text()).slice(0, 200)}`);
      await goto(page, `https://nibgate.xyz/ns/${slug}?wallet=${BUYER}`);
      const b = await bodyText(page);
      log(`[expired] buyer page: ${b.slice(0, 260)}`);
    }
    await browser.close();
  }

  block('DRAFT SAVE (trace create POST + /mine)');
  {
    const { browser, page, context } = await launch(SEL_PK);
    page.on('response', async (r) => {
      if (r.url().includes('/api/nibshare') && r.request().method() === 'POST') {
        const t = await r.text().catch(() => '');
        log(`[draft] POST ${r.url()} -> ${r.status()} ${t.slice(0, 180)}`);
      }
    });
    page.on('console', (m) => { const t = m.text(); if (/error|fail/i.test(t) && t.length < 260) log(`[draft:console] ${m.type()} ${t.slice(0, 220)}`); });
    await goto(page, 'https://nibgate.xyz/share');
    await sellerAuthed(page);
    const t = page.getByPlaceholder(/Post title/).first();
    if (await t.count()) await t.fill('E2E Matrix Draft3');
    const sb = page.getByRole('button', { name: /save as draft/i }).first();
    log(`[draft] save-as-draft present=${await sb.count()}`);
    await sb.click().catch(() => {});
    await page.waitForTimeout(8000);
    log(`[draft] url=${page.url()} | head=${(await bodyText(page)).slice(0, 200)}`);
    await browser.close();
  }

  log(`done. log=${LOG}`);
})().catch((e) => { console.error('FATAL', e); try { fs.appendFileSync(LOG, '\nFATAL: ' + (e && e.message) + '\n'); } catch {} process.exit(1); });