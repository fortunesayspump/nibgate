// Broad production combos v2: media uploads, drafts, expired, banned, custom tiers, connectivity sims.
// Robust: filechooser-based uploads, commit-based navigation with retries, per-phase crash recovery.
const { install, connectSellerFlow, bodyText, BUY_PK, SEL_PK } = require('./prod-lib.js');
const { chromium } = require('playwright');
const fs = require('fs');

const LOG = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/prod-matrix.log';
const STATE = '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/scratch/prod-state.json';
const API = 'https://api.nibgate.xyz';
const FI = (n) => `/tmp/opencode/fixtures/${n}`;
const BUYER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const SEP = '='.repeat(72);

function log(s) {
  const line = `${new Date().toISOString()} ${s}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
}
function block(t, lines) { log(`${SEP}\n## ${t}\n${(lines || []).join('\n')}`); }

function readState() { try { return JSON.parse(fs.readFileSync(STATE)); } catch { return { posts: [] }; } }
function savePost(p) {
  const st = readState();
  if (!st.posts.some((x) => x.slug === p.slug)) st.posts.push(p);
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
}

async function goto(page, url) {
  const last = { e: null };
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 45000 });
      await page.waitForTimeout(2600);
      return true;
    } catch (e) { last.e = e; await page.waitForTimeout(3000); }
  }
  throw last.e || new Error('goto failed');
}

async function uploadFile(page, path, pickerText) {
  const fcPromise = page.waitForEvent('filechooser', { timeout: 15000 });
  const el = pickerText
    ? page.getByText(new RegExp(pickerText, 'i')).first()
    : page.getByText(/click or drag to add|click to select|drag & drop/i).first();
  if (await el.count()) await el.click({ timeout: 10000 }).catch(() => {});
  else {
    // fallback: click the dropzone (div with onClick) near the file input
    await page.locator('input[type=file]').first().evaluate((el) => {
      const p = el.closest('div');
      if (p) p.click();
    }).catch(() => {});
  }
  const fc = await fcPromise;
  await fc.setFiles(path);
  await page.waitForTimeout(2600);
}

(async () => {
  log(`start matrix v2 pid=${process.pid}`);

  async function launch() {
    const browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    await install({ page, pk: SEL_PK });
    return { browser, context, page };
  }

  let h = await launch();
  const ctx = async (fn, label) => {
    try { return await fn(); }
    catch (e) {
      const closed = /closed|disposed/i.test(String(e && e.message));
      log(`[${label}] ERROR ${String(e && e.message).slice(0, 220)}${closed ? ' (context died, relaunching)' : ''}`);
      if (closed) {
        await h.browser.close().catch(() => {});
        h = await launch();
        await goto(h.page, 'https://nibgate.xyz/share');
        await h.page.waitForTimeout(2500);
        await connectSellerFlow(h.page, { label: 're-seller', log }).catch(() => {});
      }
      return null;
    }
  };
  const freshSeller = async () => {
    await goto(h.page, 'https://nibgate.xyz/share');
    const a = await connectSellerFlow(h.page, { label: 'seller', log });
    log(`seller connected: ${a || 'EMPTY'}`);
  };

  await freshSeller();

  // =====================================================================
  block('MEDIA TYPES (photo/video/music/document)', ['upload tiny file → publish free → buyer opens slug']);
  const mediaPosts = [];
  for (const [type, file, picker] of [
    ['photo', 'tiny.png', null],
    ['video', 'tiny.mp4', 'click to select'],
    ['music', 'tiny.mp3', 'click to select'],
    ['document', 'tiny.pdf', 'click to select'],
  ]) {
    await ctx(async () => {
      log(`--- media ${type} ---`);
      await goto(h.page, 'https://nibgate.xyz/share');
      await install({ page: h.page, pk: SEL_PK });
      const sel = h.page.locator('select.input-field').first();
      await sel.selectOption(type);
      await h.page.waitForTimeout(1200);
      await uploadFile(h.page, FI(file), picker);
      const ph = type === 'photo' ? 'Photo title' : type === 'video' ? 'Video title' : type === 'music' ? 'Track title' : 'Document title';
      const ti = h.page.locator(`input[placeholder="${ph}"]`).first();
      if (await ti.count()) await ti.fill(`E2E Media ${type}`);
      await h.page.getByRole('button', { name: /publish/i }).click().catch(() => {});
      await h.page.waitForTimeout(4500);
      const body = await bodyText(h.page);
      const slug = body.match(/\/ns\/([A-Za-z0-9_-]+)/)?.[1] || '';
      const uploadErr = await h.page.locator('div[style*="color: rgb(220, 38, 38)"]').count();
      log(`[media ${type}] published=${body.includes('Published!')} slug=${slug} uploadErrorElements=${uploadErr} | head=${body.slice(0, 170)}`);
      if (slug) { mediaPosts.push({ type, slug }); savePost({ title: `E2E Media ${type}`, slug, access: 'free', published: true, media: true, type }); }
      if (await h.page.getByTitle('Close').count()) { await h.page.getByTitle('Close').first().click().catch(() => {}); await h.page.waitForTimeout(800); }
    }, `media ${type}`);
  }

  for (const m of mediaPosts) {
    await ctx(async () => {
      await goto(h.page, `https://nibgate.xyz/ns/${m.slug}`);
      const img = await h.page.locator('img').count();
      const video = await h.page.locator('video').count();
      const aud = await h.page.locator('audio').count();
      const iframe = await h.page.locator('iframe').count();
      log(`[view ${m.type} ${m.slug}] imgs=${img} videos=${video} audios=${aud} iframes=${iframe} | head=${(await bodyText(h.page)).slice(0, 130)}`);
    }, `view ${m.type}`);
  }

  // =====================================================================
  block('DRAFT FLOW', ['save as draft → /mine shows draft badge → search for a publish action']);
  await ctx(async () => {
    await goto(h.page, 'https://nibgate.xyz/share');
    await install({ page: h.page, pk: SEL_PK });
    const t = h.page.getByPlaceholder(/Post title/).first();
    if (await t.count()) await t.fill('E2E Matrix Draft');
    const saveDraft = h.page.getByRole('button', { name: /save as draft/i }).first();
    log(`[draft] save-as-draft button present=${await saveDraft.count()}`);
    await saveDraft.click().catch(() => {});
    await h.page.waitForTimeout(5000);
    log(`[draft] after save url=${h.page.url()} | head=${(await bodyText(h.page)).slice(0, 170)}`);
    const mine = await bodyText(h.page);
    log(`[draft] 'E2E Matrix Draft' visible=${mine.includes('E2E Matrix Draft')} draftBadge=${mine.includes('draft')}`);
    log(`[draft] publish/activate control in mine: ${/publish|activate|make active/i.test(mine)}`);
  }, 'draft');

  // =====================================================================
  block('EXPIRED SHARE', ['API-create with past expiresAt → buyer page + access API']);
  await ctx(async () => {
    const res = await h.context.request.post(`${API}/nibshare`, { data: {
      title: 'E2E Matrix Expired', summary: 'already expired', contentType: 'article',
      content: 'should never be seen', price: '5', status: 'active',
      expiresAt: new Date(Date.now() - 3600e3).toISOString(),
      whitelist: [], whitelistPrice: null, publicAccess: true,
    } });
    const j = await res.json().catch(() => ({}));
    log(`[expired] create status=${res.status()} slug=${j.slug || ''} raw=${JSON.stringify(j).slice(0, 200)}`);
    const slug = j.slug || '';
    if (slug) savePost({ title: 'E2E Matrix Expired', slug, access: 'paid', published: true, expired: true });
    await goto(h.page, `https://nibgate.xyz/ns/${slug}?wallet=${BUYER}`);
    const b = await bodyText(h.page);
    log(`[expired] buyer page head=${b.slice(0, 220)}`);
    log(`[expired] 'expired' copy=${b.toLowerCase().includes('expired')}`);
    const acc = await h.context.request.get(`${API}/nibshare/${slug}/access?wallet=${BUYER}`);
    log(`[expired] access api status=${acc.status()} body=${(await acc.text()).slice(0, 160)}`);
  }, 'expired');

  // =====================================================================
  block('BAN / RESTORE (free post)', []);
  await ctx(async () => {
    const slug = '4xtUB8ZP';
    const ban = await h.context.request.post(`${API}/nibshare/${slug}/entitlements/${BUYER}/ban`);
    log(`[ban] ban status=${ban.status()} body=${(await ban.text()).slice(0, 140)}`);
    await goto(h.page, `https://nibgate.xyz/ns/${slug}?wallet=${BUYER}`);
    const bb = await bodyText(h.page);
    log(`[ban] buyer free-post body=${bb.slice(0, 200)}`);
    const accb = await h.context.request.get(`${API}/nibshare/${slug}/access?wallet=${BUYER}`);
    log(`[ban] access status=${accb.status()} body=${(await accb.text()).slice(0, 160)}`);
    const rest = await h.context.request.delete(`${API}/nibshare/${slug}/entitlements/${BUYER}`);
    log(`[ban] restore status=${rest.status()} body=${(await rest.text()).slice(0, 120)}`);
    const accc = await h.context.request.get(`${API}/nibshare/${slug}/access?wallet=${BUYER}`);
    log(`[ban] restored access status=${accc.status()} body=${(await accc.text()).slice(0, 140)}`);
  }, 'ban');

  // =====================================================================
  block('CUSTOM WHITELIST TIER (public 12 / whitelisted 2)', []);
  await ctx(async () => {
    const res = await h.context.request.post(`${API}/nibshare`, { data: {
      title: 'E2E Matrix Custom Tier', summary: 'custom tier demo', contentType: 'article',
      content: 'custom tier body', price: '12', status: 'active', expiresAt: null,
      whitelist: [BUYER], whitelistPrice: '2', publicAccess: true,
    } });
    const j = await res.json().catch(() => ({}));
    const slug = j.slug || '';
    log(`[custom] create status=${res.status()} slug=${slug} raw=${JSON.stringify(j).slice(0, 180)}`);
    if (slug) savePost({ title: 'E2E Matrix Custom Tier', slug, access: 'whitelist', price: 12, whitelistPrice: 2, published: true });
    const qWl = await h.context.request.get(`${API}/nibshare/${slug}/quote?wallet=${BUYER}`);
    log(`[custom] whitelisted quote=${(await qWl.text()).slice(0, 240)}`);
    const qPub = await h.context.request.get(`${API}/nibshare/${slug}/quote?wallet=0x0000000000000000000000000000000000000000`);
    log(`[custom] stranger quote=${(await qPub.text()).slice(0, 240)}`);
    await goto(h.page, `https://nibgate.xyz/ns/${slug}?wallet=${BUYER}`);
    const pg = await bodyText(h.page);
    log(`[custom] buyer UI=${pg.slice(0, 260)}`);
    log(`[custom] discount signal=${/2 usdc|whitelist/i.test(pg)}`);
  }, 'custom tier');

  // =====================================================================
  block('CONNECTIVITY / FAILURE SIMULATION', ['abort quote | 500 access | abort gateway | abort publish']);
  await ctx(async () => {
    await goto(h.page, `https://nibgate.xyz/ns/dR21SdTL?wallet=${BUYER}`);
    await h.page.route('**/nibshare/*/quote*', (r) => r.abort('connectionrefused'));
    await h.page.reload({ waitUntil: 'commit' });
    await h.page.waitForTimeout(3500);
    log(`[net] quote-aborted gate body=${(await bodyText(h.page)).slice(0, 260)}`);
    await h.page.unroute('**/nibshare/*/quote*');

    await h.page.route('**/nibshare/*/access*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"simulated outage"}' }));
    await h.page.reload({ waitUntil: 'commit' });
    await h.page.waitForTimeout(3500);
    log(`[net] access-500 body=${(await bodyText(h.page)).slice(0, 260)}`);
    await h.page.unroute('**/nibshare/*/access*');

    await h.page.route('**gateway-api-testnet.circle.com/**', (r) => r.abort('connectionrefused'));
    await h.page.reload({ waitUntil: 'commit' });
    await h.page.waitForTimeout(3500);
    log(`[net] gateway-aborted body=${(await bodyText(h.page)).slice(0, 260)}`);
    await h.page.unroute('**gateway-api-testnet.circle.com/**');
  }, 'net sim');

  await ctx(async () => {
    await goto(h.page, 'https://nibgate.xyz/share');
    await install({ page: h.page, pk: SEL_PK });
    await h.page.route('**/nibshare', (r) => r.abort('connectionrefused'));
    const ti = h.page.getByPlaceholder(/Post title/).first();
    if (await ti.count()) await ti.fill('E2E Net Fail');
    await h.page.getByRole('button', { name: /publish/i }).click().catch(() => {});
    await h.page.waitForTimeout(4000);
    const pf = await bodyText(h.page);
    log(`[net] publish-aborted errorBanner=${pf.includes('Failed') || /error|unable|retry/i.test(pf)} body=${pf.slice(0, 240)}`);
    await h.page.unroute('**/nibshare');
  }, 'net publish');

  log(`done. log=${LOG}`);
  await h.browser.close().catch(() => {});
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e);
  try { fs.appendFileSync(LOG, '\nFATAL: ' + (e && e.message) + '\n'); } catch {}
  process.exit(1);
});