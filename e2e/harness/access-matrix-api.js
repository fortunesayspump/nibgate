// GRADED API-LEVEL STRESS TEST — every fixture x viewer-state x route.
// Runs against the live hub (3000) + subblogs (4000) backends using the
// fixtures seeded by seed-fixtures-e2e.mjs.
//
// Asserts EXACT status codes + key quote fields for:
//   hub:   free/paid/invite-only/draft/revoked/expired tiers, anon, bare-claims,
//          whitelisted/not, banned/revoked entitlements
//   subblogs: the same set via /api/nibgate on the stresslab site
//
// Run:  node access-matrix-api.js

const fs = require('node:fs');
const F = JSON.parse(fs.readFileSync('/tmp/opencode/e2e/fixtures.json', 'utf8'));

const HUB = 'http://localhost:3000';
const SB = 'http://localhost:4000';
const SBH = { 'x-site-subdomain': 'stresslab' };

const W = {
  main: '0xb2152b415306a83bc658cb481fcc4829c571177a',
  imp: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
};

let passed = 0, failed = 0;
const failures = [];

async function req(url, { method = 'GET', headers = {}, expected, label, body } = {}) {
  const res = await fetch(url, { method, headers: { ...headers }, body: body ? JSON.stringify(body) : undefined });
  const status = res.status;
  let json = null;
  try { json = await res.json(); } catch {}
  const ok = status === expected;
  if (ok) { passed++; console.log(`  ok ${status} ${label}`); }
  else { failed++; failures.push(`${label}: got ${status}, want ${expected} :: ${JSON.stringify(json || {}).slice(0, 200)}`); console.log(`  FAIL ${label}: got ${status}, want ${expected} :: ${JSON.stringify(json || {}).slice(0, 160)}`); }
  return { res, json, status };
}

async function quote(url, wallet, { expectedEff, expectedInWL, expectedBanned, expectedCanUnlock, label, headers = {} }) {
  const r = await req(`${url}/quote?wallet=${wallet}`, { expected: 200, label: `${label} quote200`, headers });
  const j = r.json;
  const checks = [];
  if (expectedEff !== undefined && j.effectivePrice !== expectedEff) checks.push(`effectivePrice=${j.effectivePrice} want ${expectedEff}`);
  if (expectedInWL !== undefined && j.inWhitelist !== expectedInWL) checks.push(`inWhitelist=${j.inWhitelist} want ${expectedInWL}`);
  if (expectedBanned !== undefined && j.banned !== expectedBanned) checks.push(`banned=${j.banned} want ${expectedBanned}`);
  if (expectedCanUnlock !== undefined && j.canUnlock !== expectedCanUnlock) checks.push(`canUnlock=${j.canUnlock} want ${expectedCanUnlock}`);
  if (checks.length) { failed += checks.length; failures.push(`${label} quote: ${checks.join(', ')}`); console.log(`  FAIL ${label} quote: ${checks.join(', ')}`); }
  else { passed += (expectedInWL !== undefined) + 0; }
  return j;
}

async function main() {
  console.log('=========== HUB — quote matrix (W_MAIN / W_IMP) ===========');
  const hubBase = (slug) => `${HUB}/api/nibshare/${slug}`;

  {
    // free-public h1freepub
    const b = hubBase(F.hub['free-public'].slug);
    await quote(b, W.main, { expectedEff: '0', expectedInWL: false, expectedCanUnlock: true, label: 'hub free-public main' });
    await quote(b, W.imp, { expectedEff: '0', expectedInWL: false, expectedCanUnlock: true, label: 'hub free-public imp' });
  }
  {
    // paid-public h2paidpub — W_MAIN active(paid), W_IMP banned, alice revoked(now via later admin), bob none
    const b = hubBase(F.hub['paid-public'].slug);
    await quote(b, W.main, { expectedEff: '1', expectedInWL: false, expectedBanned: false, expectedCanUnlock: true, label: 'hub paid-public main(active)' });
    await quote(b, W.imp, { expectedEff: '1', expectedBanned: true, expectedCanUnlock: false, label: 'hub paid-public imp(banned)' });
    await quote(b, '0x1111111111111111111111111111111111111111', { expectedEff: '1', expectedBanned: false, expectedCanUnlock: true, label: 'hub paid-public alice(revoked->canRepay)' });
  }
  {
    // free-invite-main h3invmain — W_MAIN whitelisted+entitled
    const b = hubBase(F.hub['free-invite-main'].slug);
    await quote(b, W.main, { expectedEff: '0', expectedInWL: true, expectedCanUnlock: true, label: 'hub free-invite-main main(wl)' });
    await quote(b, W.imp, { expectedEff: '0', expectedInWL: false, expectedCanUnlock: false, label: 'hub free-invite-main imp(notwl)' });
  }
  {
    // free-invite-imp h4invimp — W_IMP whitelisted; W_MAIN banned (seeded)
    const b = hubBase(F.hub['free-invite-imp'].slug);
    await quote(b, W.imp, { expectedEff: '0', expectedInWL: true, expectedBanned: false, label: 'hub free-invite-imp imp(wl)' });
    await quote(b, W.main, { expectedEff: '0', expectedInWL: false, expectedBanned: true, expectedCanUnlock: false, label: 'hub free-invite-imp main(banned-notwl)' });
  }
  {
    // paid-invite-main h5paidinv — W_MAIN wl pays 0.5, others 403
    const b = hubBase(F.hub['paid-invite-main'].slug);
    await quote(b, W.main, { expectedEff: '0.5', expectedInWL: true, expectedCanUnlock: true, label: 'hub paid-invite-main main(wl,0.5)' });
    await quote(b, W.imp, { expectedEff: '1', expectedInWL: false, expectedCanUnlock: false, label: 'hub paid-invite-main imp(notwl,403)' });
  }
  {
    // paid-wl-free h6wlfree — wl=W_MAIN free, others $1
    const b = hubBase(F.hub['paid-wl-free'].slug);
    await quote(b, W.main, { expectedEff: '0', expectedInWL: true, expectedCanUnlock: true, label: 'hub paid-wl-free main(free-tier)' });
    await quote(b, W.imp, { expectedEff: '1', expectedInWL: false, expectedCanUnlock: true, label: 'hub paid-wl-free imp($1)' });
  }
  {
    // paid-wl-discount h10wldisc — wl=W_MAIN $1.25, public $2
    const b = hubBase(F.hub['paid-wl-discount'].slug);
    await quote(b, W.main, { expectedEff: '1.25', expectedInWL: true, label: 'hub paid-wl-discount main(1.25)' });
    await quote(b, W.imp, { expectedEff: '2', expectedInWL: false, label: 'hub paid-wl-discount imp(2)' });
  }
  {
    // reachability: draft/revoked/expired on meta+quote+access
    const d = hubBase(F.hub['draft'].slug);
    await req(`${d}/meta`, { expected: 404, label: 'hub draft meta=404' });
    await req(`${d}/manifest`, { expected: 404, label: 'hub draft manifest=404' });
    await req(`${d}/access`, { expected: 404, label: 'hub draft access=404' });
    await req(`${d}/quote?wallet=${W.main}`, { expected: 404, label: 'hub draft quote=404' });
    const g = hubBase(F.hub['revoked'].slug);
    await req(`${g}/meta`, { expected: 200, label: 'hub revoked meta=200 (metadata stays public)' });
    await req(`${g}/access`, { expected: 410, label: 'hub revoked access=410' });
    const x = hubBase(F.hub['expired'].slug);
    await req(`${x}/meta`, { expected: 200, label: 'hub expired meta=200 (metadata stays public)' });
    await req(`${x}/access`, { expected: 419, label: 'hub expired access=419' });
  }
  {
    // ACCESS status codes, anon + bare claims (no session, no proof)
    await req(`${hubBase(F.hub['free-public'].slug)}/access`, { expected: 200, label: 'hub free-public anon=200' });
    await req(`${hubBase(F.hub['paid-public'].slug)}/access`, { expected: 402, label: 'hub paid-public anon=402' });
    await req(`${hubBase(F.hub['paid-public'].slug)}/access?wallet=${W.main}`, { expected: 402, label: 'hub paid-public bare=402 (no session/proof)' });
    await req(`${hubBase(F.hub['free-invite-main'].slug)}/access`, { expected: 403, label: 'hub free-invite-main anon=403' });
    await req(`${hubBase(F.hub['free-invite-main'].slug)}/access?wallet=${W.main}`, { expected: 403, label: 'hub free-invite-main bare-claim=403 (no possession)' });
    await req(`${hubBase(F.hub['free-invite-imp'].slug)}/access?wallet=${W.main}`, { expected: 403, label: 'hub free-invite-imp main=403' });
    await req(`${hubBase(F.hub['paid-invite-main'].slug)}/access?wallet=${W.imp}`, { expected: 403, label: 'hub paid-invite-main imp=403 (before charge)' });
    await req(`${hubBase(F.hub['revoked'].slug)}/access?wallet=${W.main}`, { expected: 410, label: 'hub revoked main=410' });
    // expired returns 419 even with session
    await req(`${hubBase(F.hub['expired'].slug)}/access?wallet=${W.main}`, { expected: 419, label: 'hub expired main=419' });
    // draft with session still 404
    await req(`${hubBase(F.hub['draft'].slug)}/access?wallet=${W.main}`, { expected: 404, label: 'hub draft main=404' });
  }

  console.log('=========== SUBBLOGS — quote matrix ===========');
  const subBase = (slug) => `${SB}/api/nibgate/posts/${slug}`;
  {
    await quote(subBase('p1-free'), W.main, { expectedEff: '0', expectedInWL: false, expectedCanUnlock: true, label: 'sub p1-free main', headers: SBH });
    await quote(subBase('p2-paid'), W.main, { expectedEff: '1', expectedCanUnlock: true, label: 'sub p2-paid main(active)', headers: SBH });
    await quote(subBase('p2-paid'), W.imp, { expectedEff: '1', expectedBanned: true, expectedCanUnlock: false, label: 'sub p2-paid imp(banned)', headers: SBH });
    await quote(subBase('p3-free-invite'), W.main, { expectedEff: '0', expectedInWL: true, expectedCanUnlock: true, label: 'sub p3-free-invite main(wl)', headers: SBH });
    await quote(subBase('p3-free-invite'), W.imp, { expectedEff: '0', expectedInWL: false, expectedCanUnlock: false, label: 'sub p3-free-invite imp(notwl)', headers: SBH });
    await quote(subBase('p4-paid-invite'), W.main, { expectedEff: '0.5', expectedInWL: true, expectedCanUnlock: true, label: 'sub p4-paid-invite main(0.5)', headers: SBH });
    await quote(subBase('p4-paid-invite'), W.imp, { expectedEff: '1', expectedInWL: false, expectedCanUnlock: false, label: 'sub p4-paid-invite imp(403)', headers: SBH });
    await quote(subBase('p5-paid-wl-free'), W.main, { expectedEff: '0', expectedInWL: true, expectedCanUnlock: true, label: 'sub p5-paid-wl-free main(free)', headers: SBH });
    await quote(subBase('p5-paid-wl-free'), W.imp, { expectedEff: '1', expectedInWL: false, expectedCanUnlock: true, label: 'sub p5-paid-wl-free imp($1)', headers: SBH });
  }
  {
    // subblogs access matrix (real /access routes)
    const acc = (p) => `${SB}/api/nibgate/access?path=${encodeURIComponent(p)}`;
    await req(acc('/writing/p1-free'), { headers: SBH, expected: 200, label: 'sub free anon=200', headers: SBH });
    await req(acc('/writing/p2-paid'), { headers: SBH, expected: 402, label: 'sub paid anon=402', headers: SBH });
    await req(acc('/writing/p2-paid'), { headers: SBH, expected: 402, label: 'sub paid bare=402', });
    await req(acc('/writing/p3-free-invite'), { headers: SBH, expected: 403, label: 'sub free-invite anon=403', headers: SBH });
    await req(acc('/writing/p3-free-invite'), { headers: SBH, expected: 403, label: 'sub free-invite bare-claim=403', headers: SBH });
    await req(acc('/writing/p4-paid-invite'), { headers: SBH, expected: 403, label: 'sub paid-invite imp=403', });
    await req(acc('/writing/p6-draft'), { headers: SBH, expected: 404, label: 'sub draft=404', headers: SBH });
    await req(acc('/photos/p8-mediapub'), { headers: SBH, expected: 402, label: 'sub media-paid anon=402', headers: SBH });
    await req(`${SB}/api/nibgate/manifest?path=${encodeURIComponent('/writing/p2-paid')}`, { headers: SBH, expected: 200, label: 'sub manifest p2=200', headers: SBH });
    await req(`${SB}/api/blog/posts/p6-draft`, { headers: SBH, expected: 404, label: 'sub blog.getById draft=404', headers: SBH });
  }

  console.log('\n========================================');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('MATRIX FAIL:', e); process.exit(1); });