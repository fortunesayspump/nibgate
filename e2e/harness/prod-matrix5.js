// Round 5: robust ban-on-paid + restore, and draft-persistence check via seller API.
const { install, connectSellerFlow, bodyText, BUY_PK, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');

const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix5.log';
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
    try {
      await connectSellerFlow(page, { label: 'x', log: () => {} });
      break;
    } catch (e) { log(`[auth] retry connect: ${e.message.slice(0, 120)}`); await page.waitForTimeout(2000); goto(page, 'https://nibgate.xyz/share'); }
  }
  await page.waitForTimeout(1500);
  const ok = (await page.getByPlaceholder(/Post title/).count()) > 0;
  log(`[auth] form-visible=${ok}`);
  return ok;
}

(async () => {
  log('start matrix5');
  const results = [];
  const run = async (name, fn) => { try { results.push([name, await fn()]); } catch (e) { results.push([name, 'FAILED: ' + (e.message || e).slice(0, 160)]); } };

  await run('BAN-ON-PAID', async () => {
    const { browser, page, context } = await launch(SEL_PK);
    await sellerConnect(page);
    const api = context.request;
    const out = [];
    let r = await api.post(`${API}/nibshare/dR21SdTL/entitlements/${BUYER}/ban`);
    out.push(`ban=${r.status()} ${(await r.text()).slice(0, 120)}`);
    r = await api.get(`${API}/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    out.push(`access(banned)=${r.status()} ${(await r.text()).slice(0, 160)}`);
    r = await api.delete(`${API}/nibshare/dR21SdTL/entitlements/${BUYER}`);
    out.push(`restore=${r.status()} ${(await r.text()).slice(0, 120)}`);
    r = await api.get(`${API}/nibshare/dR21SdTL/access?wallet=${BUYER}`);
    out.push(`access(restored)=${r.status()} ${(await r.text()).slice(0, 160)}`);
    r = await api.get(`${API}/nibshare/dR21SdTL`);
    const meta = await r.json().catch(() => ({}));
    out.push(`meta.status=${meta.status} bannedList=${JSON.stringify((meta.entitlements || {}).banned || []).slice(0, 90)}`);
    await browser.close();
    return out.join('\n  ');
  });

  await run('DRAFT-PERSISTENCE (/mine check for E2E Matrix Draft3/4)', async () => {
    const { browser, page, context } = await launch(SEL_PK);
    await sellerConnect(page);
    const api = context.request;
    const r = await api.get(`${API}/nibshare/mine`);
    const j = await r.json().catch(() => ({}));
    const list = Array.isArray(j) ? j : (j.posts || j.items || []);
    const drafts = list.filter((p) => /E2E Matrix Draft/.test(p.title || ''));
    const out = [
      `mine=${r.status()} count=${list.length}`,
      `draftsFound=${drafts.map((d) => `${d.title}(${d.status},slug=${d.slug})`).join(' | ') || 'NONE'}`,
    ];
    await browser.close();
    return out.join('\n  ');
  });

  for (const [name, res] of results) {
    log(`${SEP}\n## ${name}\n  ${res}`);
  }
  log('done.');
})().catch((e) => { try { fs.appendFileSync(LOG, '\nFATAL: ' + e + '\n'); } catch {} process.exit(1); });