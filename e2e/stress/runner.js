// Stress-test engine: runs isolated checks against production, capturing
// console errors + HTTP 4xx/5xx per check, and emits a structured report.
//
// A check is: { id, name, group, tags, run(h, ctx) }
//   h  = harness helpers (see below)
//   ctx = { browser, context, page, log, results }
// Each check gets a fresh browser context. Checks declare `expects` for
// assertions that produce PASS/FAIL; runtime errors produce ERROR.
const { install, bodyText, connectSellerFlow, SEL_PK, BUY_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');

const OUT = process.env.STRESS_OUT || '/Users/fortune/Documents/Workflows/nibgate-repo/e2e/logs/stress-report.log';
const CHECK_TIMEOUT_MS = 85 * 1000; // hard cap per check so one slow page can't stall the battery

const EXPECTED_HTTP = new Set([404]); // 404s are usually favicons/assets
const ERROR_RE = /net::|Failed to load resource|ERR_|Analytics SDK|fetch/i;
const NOISE = /auth\/me|status of 401/; // logged-out session poll / connect-time 401s are expected

const state = { total: 0, pass: 0, fail: 0, error: 0, warn: 0, results: [] };

function ts() { return new Date().toISOString().slice(11, 23); }
function esc(s) { return String(s).replace(/\n/g, ' ').slice(0, 220); }

function write(line) {
  process.stdout.write(line + '\n');
  try { require('fs').appendFileSync(OUT, line + '\n'); } catch {}
}

async function newBrowser(pk = SEL_PK) {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(35000);
  if (pk !== 'anon') await install({ page, pk });
  return { browser, context, page };
}

async function gotoSafe(page, url, wait = 2600) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(url, { waitUntil: 'commit', timeout: 35000 }); await page.waitForTimeout(wait); return true; }
    catch { await page.waitForTimeout(1800); }
  }
  return false;
}

const h = {
  SEL_PK, BUY_PK,
  ts, esc, write,
  newBrowser, gotoSafe,
  bodyText,
  click: async (page, loc, label) => { const n = await loc.count(); if (!n) throw new Error(`missing ${label}`); await loc.first().click({ force: true, timeout: 15000 }); },
  has: async (page, re) => re.test(await bodyText(page)),
  // Capture console+http for a check; returns {consoleErrs:[], http:[], body}
  watcher(page, { accept = () => true } = {}) {
    const out = { consoleErrs: [], http: [], requests: [] };
    const onConsole = (m) => { const t = m.text(); if (m.type() === 'error' && ERROR_RE.test(t) && accept(t) && !NOISE.test(t)) out.consoleErrs.push(t.slice(0, 200)); };
    const onResp = (r) => {
      if (r.status() >= 400 && !EXPECTED_HTTP.has(r.status()) && !NOISE.test(r.url())) {
        const u = r.url();
        if (/api|nibgate|ns\//.test(u)) out.http.push(`${r.status()} ${r.request().method()} ${u.slice(0, 140)}`);
      }
    };
    page.on('console', onConsole);
    page.on('response', onResp);
    return { out, detach: () => { page.removeListener('console', onConsole); page.removeListener('response', onResp); } };
  }
};

async function runCheck(check, batch) {
  state.total++;
  const r = { id: check.id, name: esc(check.name), group: check.group || batch, result: 'ok', notes: [], http: [], console: '' };
  let browser;
  try {
    const { browser: b, context, page } = await newBrowser(check.pk || SEL_PK);
    browser = b;
    const w = h.watcher(page, check.accept || (() => true));
    const ctx = { browser, context, page, log: (msg) => r.notes.push(esc(msg)) };
    let expects = [];
    const res = await withTimeout(Promise.resolve().then(() => check.run(h, ctx)), CHECK_TIMEOUT_MS);
    if (res && res.__timeout) expects = [[false, `CHECK TIMED OUT after ${CHECK_TIMEOUT_MS / 1000}s (page stall)`]];
    else expects = res || [];
    w.detach();
    r.http = w.out.http.slice(0, 6);
    if (w.out.consoleErrs.length) { r.result = 'warn'; r.console = w.out.consoleErrs.join(' | ').slice(0, 200); }
    for (const [cond, msg] of expects) {
      if (!cond) { r.result = 'fail'; r.notes.push('✗ ' + msg); }
      else r.notes.push('✓ ' + msg);
    }
    await b.close().catch(() => {});
  } catch (e) {
    r.result = 'error';
    r.notes.push('⛔ ' + esc((e && e.stack || e).slice(0, 240)));
    if (browser) await browser.close().catch(() => {});
  }
  if (r.result === 'fail') state.fail++;
  else if (r.result === 'error') state.error++;
  else if (r.result === 'warn') state.warn++;
  else state.pass++;
  state.results.push(r);
  write(`${ts()} [${r.result.toUpperCase().padEnd(5)}] ${r.group}/${r.id}`);
  for (const n of r.notes) write(`    ${n}`);
  if (r.http.length) write(`    http: ${r.http.join(' | ')}`);
  if (r.console) write(`    console: ${r.console}`);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ __timeout: true }), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }).catch((e) => { clearTimeout(timer); reject(e); });
  });
}

async function runAll(batches, { only = [], skip = [], groups = [] } = {}) {
  const want = new Set(only);
  const skipSet = new Set(skip);
  const groupsSet = new Set(groups);
  write(`\n${'='.repeat(90)}\nSTRESS RUN ${new Date().toISOString()}  (${batches.length} batches)\n${'='.repeat(90)}`);
  for (const batch of batches) {
    if (groupsSet.size && !groupsSet.has(batch.name)) continue;
    write(`\n## BATCH: ${batch.name}`);
    for (const check of batch.checks) {
      if (want.size && !want.has(check.id)) continue;
      if (skipSet.has(check.id)) continue;
      await runCheck(check, batch.name);
    }
  }
  write(`\n${'='.repeat(90)}\nSUMMARY  total=${state.total} pass=${state.pass} fail=${state.fail} error=${state.error} warn=${state.warn}\n${'='.repeat(90)}`);
  const fails = state.results.filter((r) => r.result === 'fail' || r.result === 'error');
  if (fails.length) { write('\nFAILURES/ERRORS:'); for (const f of fails) write(`  ${f.group}/${f.id} [${f.result}]: ${f.notes.join(' | ').slice(0, 200)}`); }
  return state;
}

module.exports = { h, runAll, runCheck, state, write, OUT };