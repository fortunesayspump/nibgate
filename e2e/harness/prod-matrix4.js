// Round 4: fixed auth (connectSellerFlow), draft with body, expired-future, ban-on-paid, gate quote tracing.
const { install, connectSellerFlow, bodyText, BUY_PK, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');

const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix4.log';
const API = 'https://api.nibgate.xyz';
const BUYER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const SEP = '='.repeat(72);

function log(s) { const line = `${new Date().toISOString()} ${s}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch {} }
function block(t, extra) { log(`${SEP}\n## ${t}`); if (extra) log(extra); }

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
async function sellerConnect(page) {
  await goto(page, 'https://nibgate.xyz/share');
  await connectSellerFlow(page, { label: 'x', log: () => {} });
  // after SIWE the form shows
  await page.waitForTimeout(2000);
  const hasForm = (await page.getByPlaceholder(/Post title/).count()) > 0;
  log(`[auth] form-visible=${hasForm} addr=${(await bodyText(page)).match(/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/)?.[0] || ''}`);
  return hasForm;
}

(async () => {
  log(`start matrix4 pid=${process.pid}`);

  const blocks = [];
  blocks.push(async () => {
    log(`${SEP}\n## CUSTOM-TIER GATE vs WHITELIST-FREE GATE (buyer connected)`);
    log('ddLEPvxv (tier 2 of 12) vs JsLravCn (tier free of 9)');
  for (const [name, slug, expect] of [['custom-tier', 'ddLEPvxv', '2 USDC'], ['whitelist-free', 'JsLravCn', 'free']]) {
    const { browser, page } = await launch(BUY_PK);
    page.on('response', async (r) => {
      if (r.url().includes('/quote')) log(`[gate:${name}] QUOTE ${r.status()} ${(await r.text().catch(() => '')).slice(0, 220)}`);
    });
    await goto(page, `https://nibgate.xyz/ns/${slug}`);
    await page.waitForTimeout(2000);
    // connect the buyer via the gate's connect button
    for (let i = 0; i < 4; i++) {
      const b = await bodyText(page);
      if (/0x3C44/i.test(b)) break;
      if (b.includes('Connect wallet')) {
        await page.getByText(/connect wallet/i).first().click().catch(() => {});
        await page.waitForTimeout(2200);
      } else if (b.includes('Sign the message') && await page.getByRole('button', { name: /sign with wallet/i }).count()) {
        await page.getByRole('button', { name: /sign with wallet/i }).click().catch(() => {});
        await page.waitForTimeout(2600);
      }
      if (/(Hold to pay|Unlock|Checking)/.test(b)) await page.waitForTimeout(2000);
    }
    const b = await bodyText(page);
    log(`[gate:${name}] FINAL: ${b.slice(0, 360)}`);
    log(`[gate:${name}] shows ${expect}: ${b.toLowerCase().includes(expect.toLowerCase()) || (name === 'whitelist-free' && b.toLowerCase().includes('free'))} | whitelist-banner: ${/whitelist/i.test(b)}`);
    await browser.close();
  }
  });

  blocks.push(async () => {
    log(`${SEP}\n## BAN ON PAID POST (dR21SdTL) + restore`);
  {
    const { browser, page, context } = await launch(SEL_PK);
    await sellerConnect(page);
    const api = context.request;
    let r = await api.post(`${API}/api/nibshare/dR21SdTL/entitlements/${BUYER}/ban`);
    log(`[ban-paid] ban=${r.status()} ${(await r.text()).slice(0, 140)}`);
    r = await api.get(`${API}/api/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    log(`[ban-paid] buyer access (banned) = ${r.status()} ${(await r.text()).slice(0, 180)}`);
    r = await api.delete(`${API}/api/nibshare/dR21SdTL/entitlements/${BUYER}`);
    log(`[ban-paid] restore=${r.status()} ${(await r.text()).slice(0, 140)}`);
    r = await api.get(`${API}/api/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    log(`[ban-paid] buyer access (restored) = ${r.status()} ${(await r.text()).slice(0, 180)}`);
    await browser.close();
  }
  });

  blocks.push(async () => {
    log(`${SEP}\n## EXPIRED SHARE (create now+6s, wait 11s, view)`);
  {
    const { browser, page, context } = await launch(SEL_PK);
    await sellerConnect(page);
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
      log(`[expired] access-after-expiry=${acc.status()} ${(await acc.text()).slice(0, 220)}`);
      await goto(page, `https://nibgate.xyz/ns/${slug}?wallet=${BUYER}`);
      const b = await bodyText(page);
      log(`[expired] buyer page: ${b.slice(0, 280)}`);
    }
    await browser.close();
  }
  });

  blocks.push(async () => {
    log(`${SEP}\n## DRAFT SAVE WITH BODY (trace POST + /mine row)`);
  {
    const { browser, page, context } = await launch(SEL_PK);
    page.on('response', async (r) => {
      if (r.url().includes('/api/nibshare') && r.request().method() === 'POST') {
        const t = await r.text().catch(() => '');
        log(`[draft] POST ${r.url().slice(0, 90)} -> ${r.status()} ${t.slice(0, 200)}`);
      }
    });
    await sellerConnect(page);
    const t = page.getByPlaceholder(/Post title/).first();
    if (await t.count()) await t.fill('E2E Matrix Draft4');
    const ed = page.locator('.tiptap, .ProseMirror [contenteditable], [contenteditable]').first();
    if (await ed.count()) { await ed.click(); await page.keyboard.type('draft body **bold**', { delay: 2 }); }
    await page.waitForTimeout(500);
    const sb = page.getByRole('button', { name: /save as draft/i }).first();
    log(`[draft] save-as-draft enabled-check: ${await sb.isEnabled().catch(() => 'n/a')}`);
    await sb.click().catch(() => {});
    await page.waitForTimeout(9000);
    log(`[draft] url=${page.url()} | head=${(await bodyText(page)).slice(0, 220)}`);
    const mine = await bodyText(page);
    log(`[draft] 'E2E Matrix Draft4' visible=${mine.includes('E2E Matrix Draft4')} draftBadge=${mine.includes('draft')}`);
    await browser.close();
  }
  });

  for (let i = 0; i < blocks.length; i++) {
    try { await blocks[i](); }
    catch (e) { log(`[block${i}] FAILED: ${e && e.message ? e.message.slice(0, 300) : e}`); }
  }

  log(`done. log=${LOG}`);
})().catch((e) => { console.error('FATAL', e); try { fs.appendFileSync(LOG, '\nFATAL: ' + (e && e.message) + '\n'); } catch {} process.exit(1); });