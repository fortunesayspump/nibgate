const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const BASE_PROFILE = process.env.MM_PROFILE || '/tmp/opencode/e2e/mm-profile';
const PASSWORD = 'TestWallet123!';
const TEST_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // 0x7099...79c8

// Launch a fresh persistent context; if `cloneProfile` is set, copy the seeded
// wallet profile first so each test starts with a on-boarded+unlocked wallet but
// NO site cookies (state isolation between tests).
async function launch(options = {}) {
  const { cloneProfile = BASE_PROFILE, freshCookies = true } = options;
  const PROFILE = cloneProfile || BASE_PROFILE;
  if (freshCookies && PROFILE !== BASE_PROFILE && fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });

  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
    timeout: 60000,
  });

  if (freshCookies && PROFILE === BASE_PROFILE) {
    // never wipe the base wallet profile, but do wipe site cookies for isolation
    await context.clearCookies().catch(() => {});
  }
  const worker = await (async () => {
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const w = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
      if (w) return w;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  })();
  if (!worker) throw new Error('MetaMask worker missing');
  return { context, extensionId: new URL(worker.url()).host };
}

async function homePage(context, extensionId) {
  const home = await context.newPage();
  home.setDefaultTimeout(10000);
  await home.goto(`chrome-extension://${extensionId}/home.html`, { timeout: 30000 });
  await home.waitForTimeout(2500);
  await unlock(home);
  return home;
}

async function unlock(page) {
  const pw = page.locator('input[type="password"]').first();
  if (await pw.count()) {
    await pw.fill(PASSWORD);
    await page.locator('[data-testid="unlock-submit"]').first().click();
    await page.waitForTimeout(2000);
  }
}

async function body(page) {
  return (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
}

async function has(page, sel, text) {
  const loc = sel ? page.locator(sel) : page.getByText(text, { exact: false });
  return (await loc.count().catch(() => 0)) > 0;
}

async function clickIf(page, sel, text, force = false) {
  const loc = sel ? page.locator(sel).first() : page.getByText(text, { exact: false }).first();
  if (await loc.count().catch(() => 0)) {
    await loc.click(force ? { force: true, timeout: 8000 } : { timeout: 8000 }).catch(() => {});
    return true;
  }
  return false;
}

async function isOnMainWallet(page) {
  return await has(page, '[data-testid="account-menu-icon"], [data-testid="account-options-menu-button"]');
}

async function ensureMainWallet(home) {
  let guard = 0;
  while (guard++ < 15) {
    if (await isOnMainWallet(home)) return true;
    const clicked =
      (await clickIf(home, '[data-testid="passkey-maybe-later-button"]')) ||
      (await clickIf(home, '[data-testid="recovery-phrase-remind-later"]')) ||
      (await clickIf(home, '[data-testid="recovery-phrase-continue"]')) ||
      (await clickIf(home, '[data-testid="metametrics-i-agree"]')) ||
      (await clickIf(home, '[data-testid="onboarding-complete-done"]', null, true));
    if (!clicked) await home.waitForTimeout(800);
    await home.waitForTimeout(900);
  }
  return await isOnMainWallet(home);
}

// Drive the whole dapp connect flow: click connect, pick MetaMask, approve
// every MetaMask notification popup until the wallet is connected. Returns the
// wallet address shown, or null.
async function connectDapp(context, dappPage, { connectLabel = 'Connect wallet' } = {}) {
  // find an enabled button whose text matches the connect label (never "Hold to pay")
  const buttons = dappPage.locator('button');
  const nb = await buttons.count();
  let clicked = false;
  for (let i = 0; i < nb; i++) {
    const t = ((await buttons.nth(i).textContent().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
    if (t.includes(connectLabel) && !t.includes('Hold to pay')) {
      const dis = await buttons.nth(i).isDisabled().catch(() => true);
      if (!dis) { await buttons.nth(i).click(); clicked = true; break; }
    }
  }
  // already connected? -> disconnect first so connect() re-runs SIWE
  if (!clicked) {
    const disco = dappPage.locator('button:has-text("Disconnect")');
    if (await disco.count()) {
      await disco.first().click().catch(() => {});
      await dappPage.waitForTimeout(1500);
    }
  }
  // already connected? (still showing disconnect after wipe => auto-connect won)
  if (!clicked) {
    const disco = await dappPage.locator('button:has-text("Disconnect")').count().catch(() => 0);
    if (disco > 0) return 'already-connected';
    // reload once to refresh gate state (old session may disable the button)
    await dappPage.reload().catch(() => {});
    await dappPage.waitForTimeout(4000);
    for (let i = 0; i < nb; i++) {
      const t = ((await buttons.nth(i).textContent().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
      if (t.includes(connectLabel) && !t.includes('Hold to pay')) {
        const dis = await buttons.nth(i).isDisabled().catch(() => true);
        if (!dis) { await buttons.nth(i).click(); clicked = true; break; }
      }
    }
  }
  if (!clicked) return null;
  await dappPage.waitForTimeout(2500);

  // AppKit modal -> MetaMask
  const mmOpt = dappPage.locator('w3m-modal button:has-text("MetaMask installed")').first();
  if (await mmOpt.count()) await mmOpt.click();
  await dappPage.waitForTimeout(1500);

  // approval popups
  for (let outer = 0; outer < 6; outer++) {
    let notif = null;
    for (let i = 0; i < 25; i++) {
      notif = context.pages().find((p) => p.url().includes('notification'));
      if (notif) break;
      await dappPage.waitForTimeout(500);
    }
    if (!notif) break;
    let closed = false;
    notif.once('close', () => { closed = true; });
    for (let round = 0; round < 10; round++) {
      if (closed || notif.isClosed()) break;
      const primary = notif.locator('[data-testid="confirm-footer-button"], [data-testid="confirm-btn"]').last();
      if (await primary.count().catch(() => 0)) {
        await primary.click({ force: true }).catch(() => {});
        await notif.waitForTimeout(1800).catch(() => {});
      } else {
        await notif.waitForTimeout(1200).catch(() => {});
      }
    }
    await dappPage.waitForTimeout(1500);
  }
  // wait for wallet to become connected on the page
  const disco = await dappPage.locator('button:has-text("Disconnect")').count().catch(() => 0);
  if (disco > 0) return 'connected';
  return null;
}

// Wipe dapp-side wallet state (wagmi/appkit localStorage) on the given origins
// so each fresh profile starts fully disconnected. Call before any dapp load.
function wipeDappState(context, origins) {
  return context.addInitScript(({ origins: o }) => {
    if (!window.location || typeof localStorage === 'undefined') return;
    if (!o.some((x) => location.origin.includes(x))) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/wagmi|appkit|w3m|walletconnect|nibgate\.wallet/i.test(k)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  }, { origins });
}

module.exports = {
  launch, homePage, unlock, body, has, clickIf, ensureMainWallet, connectDapp, wipeDappState,
  importAccountByPrivateKey, EXT, PROFILE: BASE_PROFILE, PASSWORD, TEST_PK,
};

async function importAccountByPrivateKey(home, pk) {
  await ensureMainWallet(home);
  await clickIf(home, '[data-testid="account-menu-icon"]');
  await home.waitForTimeout(800);
  await clickIf(home, '[data-testid="account-list-add-wallet-button"]');
  await home.waitForTimeout(1000);
  const pkText = home.locator('text="Via a private key"').first();
  const box = await pkText.boundingBox();
  if (!box) throw new Error('private-key row not found');
  await home.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await home.waitForTimeout(1000);
  const ta = home.locator('textarea, input[type="password"]').first();
  if (!(await ta.count())) throw new Error('private key input not found');
  await ta.fill(pk);
  await home.waitForTimeout(400);
  await clickIf(home, '[data-testid="import-account-confirm-button"]', null, true);
  await home.waitForTimeout(1500);
  return true;
}

if (require.main === module) {
  (async () => {
    const { context, extensionId } = await launch();
    const home = await homePage(context, extensionId);
    console.log('main wallet:', await ensureMainWallet(home), '|', await body(home));
    await context.close();
    process.exit(0);
  })().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
}