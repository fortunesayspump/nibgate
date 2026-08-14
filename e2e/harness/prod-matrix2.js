// Round 2: media upload error detail, custom-tier UI w/ buyer wallet, ban-on-paid, expired-via-future, draft create trace.
const { install, bodyText, BUY_PK, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');

const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix2.log';
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
    try { await page.goto(url, { waitUntil: 'commit', timeout: 45000 }); await page.waitForTimeout(2400); return; }
    catch (e) { await page.waitForTimeout(2500); }
  }
}
async function uploadFile(page, path) {
  const fcP = page.waitForEvent('filechooser', { timeout: 15000 });
  const el = page.getByText(/click or drag to add|click to select|drag & drop/i).first();
  if (await el.count()) await el.click().catch(() => {});
  const fc = await fcP;
  await fc.setFiles(path);
  await page.waitForTimeout(2800);
}

(async () => {
  log(`start matrix2 pid=${process.pid}`);

  // ---- 1. MEDIA UPLOAD ERROR DETAIL ----
  block('MEDIA UPLOAD ERROR DETAIL (photo)');
  {
    const { browser, page, context } = await launch(SEL_PK);
    page.on('console', (m) => { const t = m.text(); if (/error|fail|401|403|failed/i.test(t) && t.length < 300) log(`[photo:console] ${m.type()} ${t.slice(0, 260)}`); });
    page.on('requestfailed', (r) => log(`[photo:reqfail] ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
    await goto(page, 'https://nibgate.xyz/share');
    // wait for form (authenticated) or connect
    await page.waitForTimeout(2000);
    if (await page.getByText(/connect wallet/i).count()) {
      log('[photo] need connect flow; clicking sign-with-wallet path if present');
      const btn = await page.getByRole('button', { name: /sign with wallet/i }).count();
      if (btn) await page.getByRole('button', { name: /sign with wallet/i }).click();
      await page.waitForTimeout(2500);
    }
    await page.locator('select.input-field').first().selectOption('photo');
    await page.waitForTimeout(1200);
    await uploadFile(page, '/tmp/opencode/fixtures/tiny.png');
    // any upload error text?
    const errs = await page.locator('div').filter({ hasText: /failed|error/i }).allInnerTexts().catch(() => []);
    log(`[photo] error-ish divs: ${JSON.stringify(errs.filter((e) => e.trim()).slice(0, 6))}`);
    await browser.close();
  }

  // ---- 2. CUSTOM-TIER UI WITH BUYER WALLET ----
  block('CUSTOM-TIER GATE UI (buyer-installed view of ddLEPvxv)');
  {
    const { browser, page, context } = await launch(BUY_PK);
    await goto(page, 'https://nibgate.xyz/ns/ddLEPvxv');
    const b = await bodyText(page);
    log(`[custom] buyer-connected gate: ${b.slice(0, 300)}`);
    log(`[custom] shows 2 USDC tier: ${b.includes('2 USDC')} | whitelist banner: ${/whitelist/i.test(b)} | shows full 12: ${b.includes('12 USDC')}`);
    await browser.close();
  }

  // ---- 3. BAN ON PAID POST ----
  block('BAN ON PAID POST (dR21SdTL)');
  {
    const { browser, page, context } = await launch(SEL_PK);
    await goto(page, 'https://nibgate.xyz/share');
    if (await page.getByRole('button', { name: /sign with wallet/i }).count()) await page.getByRole('button', { name: /sign with wallet/i }).click().catch(() => {});
    await page.waitForTimeout(2500);
    const api = context.request;
    let r = await api.post(`${API}/api/nibshare/dR21SdTL/entitlements/${BUYER}/ban`);
    log(`[ban-paid] ban status=${r.status()} body=${(await r.text()).slice(0, 130)}`);
    r = await api.get(`${API}/api/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    log(`[ban-paid] buyer access status=${r.status()} body=${(await r.text()).slice(0, 160)}`);
    r = await api.delete(`${API}/api/nibshare/dR21SdTL/entitlements/${BUYER}`);
    log(`[ban-paid] restore status=${r.status()} body=${(await r.text()).slice(0, 130)}`);
    r = await api.get(`${API}/api/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    log(`[ban-paid] after-restore access status=${r.status()} body=${(await r.text()).slice(0, 160)}`);
    await browser.close();
  }

  // ---- 4. EXPIRED SHARE VIA FUTURE-EXPIRY + WAIT ----
  block('EXPIRED SHARE (create with +6s expiry, wait 10s)');
  {
    const { browser, page, context } = await launch(SEL_PK);
    await goto(page, 'https://nibgate.xyz/share');
    if (await page.getByRole('button', { name: /sign with wallet/i }).count()) await page.getByRole('button', { name: /sign with wallet/i }).click().catch(() => {});
    await page.waitForTimeout(2500);
    const api = context.request;
    const res = await api.post(`${API}/api/nibshare`, { data: {
      title: 'E2E Matrix Expiring', summary: 'expires shortly', contentType: 'article',
      content: 'body', price: '3', status: 'active',
      expiresAt: new Date(Date.now() + 6000).toISOString(),
      whitelist: [], whitelistPrice: null, publicAccess: true,
    } });
    const j = await res.json().catch(() => ({}));
    const slug = j.slug || '';
    log(`[expired] create status=${res.status()} slug=${slug} expiresAt ok=${!j.error}`);
    if (slug) {
      await page.waitForTimeout(10000);
      const acc = await api.get(`${API}/api/nibshare/${slug}/access?wallet=${BUYER}`);
      log(`[expired] access-after-wait status=${acc.status()} body=${(await acc.text()).slice(0, 180)}`);
      await goto(page, `https://nibgate.xyz/ns/${slug}?wallet=${BUYER}`);
      const b = await bodyText(page);
      log(`[expired] buyer page after expiry: ${b.slice(0, 240)}`);
    }
    await browser.close();
  }

  // ---- 5. DRAFT CREATE TRACE ----
  block('DRAFT SAVE (trace the create POST)');
  {
    const { browser, page, context } = await launch(SEL_PK);
    page.on('console', (m) => { const t = m.text(); if (/error|fail|401|403/i.test(t) && t.length < 300) log(`[draft:console] ${m.type()} ${t.slice(0, 240)}`); });
    page.on('request', (r) => { if (r.url().includes('/api/nibshare')) log(`[draft:req] ${r.method()} ${r.url().slice(0, 120)}`); });
    page.on('response', (r) => { if (r.url().includes('/api/nibshare')) r.text().then((t) => log(`[draft:resp] ${r.status()} ${r.url().slice(0, 100)} ${t.slice(0, 140)}`)).catch(() => {}); });
    await goto(page, 'https://nibgate.xyz/share');
    if (await page.getByRole('button', { name: /sign with wallet/i }).count()) await page.getByRole('button', { name: /sign with wallet/i }).click().catch(() => {});
    await page.waitForTimeout(2500);
    const t = page.getByPlaceholder(/Post title/).first();
    if (await t.count()) await t.fill('E2E Matrix Draft2');
    await page.getByRole('button', { name: /save as draft/i }).click().catch(() => {});
    await page.waitForTimeout(8000);
    log(`[draft] url after save=${page.url()} | err divs=${JSON.stringify((await page.locator('div').filter({ hasText: /failed|error/i }).allInnerTexts().catch(() => [])).filter((e) => e.trim()).slice(0, 4))}`);
    log(`[draft] body=${(await bodyText(page)).slice(0, 200)}`);
    await browser.close();
  }

  log(`done. log=${LOG}`);
})().catch((e) => { console.error('FATAL', e); try { fs.appendFileSync(LOG, '\nFATAL: ' + (e && e.message) + '\n'); } catch {} process.exit(1); });