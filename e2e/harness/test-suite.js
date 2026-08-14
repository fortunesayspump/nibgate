const mm = require('./mm');
const path = require('node:path');
const fs = require('node:fs');

// Fresh per-test profile clones so each run starts with an onboarded wallet but
// zero site cookies / no prior connection.
function freshProfile(tag) {
  const dir = `/tmp/opencode/e2e/profiles/${tag}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(mm.PROFILE, dir, { recursive: true });
  return dir;
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
  console.log('  ok:', msg);
}

async function main() {
  const HUB = 'http://localhost:3001';
  const SUB = 'http://localhost:3002';

  console.log('=== TEST 1: hub free share loads readable ===');
  {
    const { context } = await mm.launch({ cloneProfile: freshProfile('t1'), freshCookies: false });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(`${HUB}/ns/VC5PMzrw`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    const text = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, '|');
    assert(!text.includes('Pay|to|unlock'), 'free public share should not be gated');
    await context.close();
  }

  console.log('=== TEST 2: hub paid share gates anon ===');
  {
    const { context } = await mm.launch({ cloneProfile: freshProfile('t2'), freshCookies: false });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(`${HUB}/ns/bgYyjNKc`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    const text = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, '|');
    assert(text.includes('Pay|to|unlock'), 'paid share shows gate to anon');
    await context.close();
  }

  console.log('=== TEST 3: hub draft returns 404 in UI ===');
  {
    const { context } = await mm.launch({ cloneProfile: freshProfile('t3'), freshCookies: false });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(`${HUB}/ns/8htFe1AH`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    const text = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, '|');
    assert(!text.includes('Writing|'), 'draft should not render content');
    await context.close();
  }

  console.log('=== TEST 4: hub connect -> SIWE -> connected state ===');
  {
    const profile = freshProfile('t4');
    const { context } = await mm.launch({ cloneProfile: profile, freshCookies: false });
    await context.clearCookies().catch(() => {});
    mm.wipeDappState(context, ['localhost:3001']);
    const worker = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    const home = await mm.homePage(context, new URL(worker.url()).host);
    await mm.ensureMainWallet(home).catch(() => {});
    const hub = await context.newPage();
    hub.setDefaultTimeout(25000);
    await hub.goto(`${HUB}/ns/bgYyjNKc`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await hub.waitForTimeout(5000);
    const res = await mm.connectDapp(context, hub);
    console.log('  connect result:', res);
    assert(res === 'connected' || res === 'already-connected', 'wallet should become connected');
    await hub.waitForTimeout(2000);
    const text = ((await hub.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, '|');
    assert(text.includes('Disconnect'), 'hub shows disconnect once wallet connected');
    // session cookie should be set
    const cookies = await context.cookies(HUB);
    const session = cookies.find((c) => c.name === 'auth_session');
    assert(!!session, 'SIWE auth_session cookie set after connect sign');
    await context.close();
  }
  mm.launch; // noop

  console.log('=== TEST 5: subblogs paid post gates anon + connect works ===');
  {
    const profile = freshProfile('t5');
    const { context } = await mm.launch({ cloneProfile: profile, freshCookies: false });
    await context.clearCookies().catch(() => {});
    mm.wipeDappState(context, ['localhost:3002']);
    const worker = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
    const home = await mm.homePage(context, new URL(worker.url()).host);
    await mm.ensureMainWallet(home).catch(() => {});
    const sub = await context.newPage();
    sub.setDefaultTimeout(25000);
    await sub.goto(`${SUB}/video/synthesizer-comparison`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sub.waitForTimeout(5000);
    const text = ((await sub.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, '|');
    assert(text.includes('Pay|to|unlock') || text.includes('Connect|wallet'), 'subblogs paid post gates anon');
    const res = await mm.connectDapp(context, sub);
    console.log('  sub connect result:', res);
    await sub.waitForTimeout(2000);
    const cookies = await context.cookies(SUB);
    const session = cookies.find((c) => c.name === 'sb_auth_session');
    console.log('  sub cookies:', cookies.map((c) => c.name).join(','));
    assert(!!session, 'subblogs sb_auth_session cookie set');
    await context.close();
  }

  console.log('\nALL TESTS PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });