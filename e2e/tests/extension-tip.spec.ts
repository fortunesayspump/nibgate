import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

const EXT_PATH = path.resolve('extension/dist');

async function openPopupReady(
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
  id: string,
) {
  const page = await context.newPage();
  for (let i = 0; i < 4; i++) {
    await page.goto(`chrome-extension://${id}/popup.html`);
    try {
      await page.locator('#screen-onboard, #screen-lock, #app').first().waitFor({ timeout: 10000 });
      return page;
    } catch {}
  }
  return page;
}

// Drive the new onboarding UI: welcome → create → password → backup confirm.
async function createWalletViaUi(page: import('@playwright/test').Page, password = 'e2e-test-password') {
  await page.getByRole('button', { name: 'Create a new wallet' }).click();
  await page.locator('#new-password').fill(password);
  await page.getByRole('button', { name: 'Create wallet' }).click();
  await page.locator('#ob-mnemonic span').first().waitFor({ timeout: 30000 });
  await page.locator('#ob-saved').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#balance').waitFor({ timeout: 10000 });
}

function lanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal && info.address.startsWith('192.168.')) return info.address;
    }
  }
  for (const list of Object.values(ifaces)) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}

const ARTICLE = `<!doctype html><html><head>
<title>Why Sourdough Wins</title>
<meta property="og:title" content="Why Sourdough Wins">
<meta name="author" content="Maya Eats">
<meta name="nibgate:recipient" content="0x7e27afba45d880ba94b0c08efd1523d2dee627fe">
</head><body><main><article>
<h1>Why Sourdough Wins</h1>
<p>${'Fermentation transforms flour, water, and salt into something transcendent. '.repeat(40)}</p>
</article></main></body></html>`;

test('extension injects exactly one tip card with presets on an article page', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(ARTICLE);
  });
  await new Promise<void>((r) => server.listen(3098, '0.0.0.0', r));
  const host = lanIp();

  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-ext-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  try {
    const page = await context.newPage();
    await page.goto(`http://${host}:3098/post`);
    const card = page.locator('#nibgate-card');
    await expect(card).toHaveCount(1, { timeout: 30000 });
    await expect(card.getByRole('button', { name: '$1', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: '$5', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: '$10', exact: true })).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/extension-card.png', timeout: 10000 }).catch(() => {});
  } finally {
    await context.close();
    server.close();
  }
});

test('custom amount validates cancel and non-positive input', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(ARTICLE);
  });
  await new Promise<void>((r) => server.listen(3096, '0.0.0.0', r));
  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-ext-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  let answer: string | null = null;
  try {
    const page = await context.newPage();
    page.on('dialog', (d) => (answer === null ? d.dismiss() : d.accept(answer)));
    await page.goto(`http://${lanIp()}:3096/post`);
    const card = page.locator('#nibgate-card');
    await expect(card).toHaveCount(1, { timeout: 30000 });
    const status = card.locator('[data-tip-status]');

    answer = null; // dismiss the prompt → cancel
    await card.locator('[data-tip="custom"]').click();
    await expect(status).toContainText('Cancelled', { timeout: 10000 });

    answer = '0'; // non-positive → rejected before any payment
    await card.locator('[data-tip="custom"]').click();
    await expect(status).toContainText('positive amount', { timeout: 10000 });
  } finally {
    await context.close();
    server.close();
  }
});

test('tipping with a locked wallet opens the unlock popup', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(ARTICLE);
  });
  await new Promise<void>((r) => server.listen(3095, '0.0.0.0', r));
  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-ext-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  try {
    let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    for (let i = 0; i < 20 && !sw; i++) { await new Promise((r) => setTimeout(r, 500)); sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')); }
    const id = new URL(sw!.url()).hostname;

    const popup = await openPopupReady(context, id);
    await popup.evaluate(
      (pw) => new Promise((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.runtime.sendMessage({ type: 'VAULT_CREATE', password: pw }, resolve);
      }),
      'e2e-locked-password',
    );
    await popup.evaluate(
      () => new Promise((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.storage.local.set({ nibgateCustomHubApi: 'http://localhost:3005', nibgateNetwork: 'testnet' }, () => resolve(null));
      }),
    );
    await popup.evaluate(
      () => new Promise((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.runtime.sendMessage({ type: 'VAULT_LOCK' }, resolve);
      }),
    );
    await popup.close();

    const page = await context.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(`http://${lanIp()}:3095/post`);
    const card = page.locator('#nibgate-card');
    await expect(card).toHaveCount(1, { timeout: 30000 });
    await card.getByRole('button', { name: '$1', exact: true }).click();
    await expect(card.locator('[data-tip-status]')).toContainText('Unlock the extension', { timeout: 20000 });

    // The worker opened the unlock popup window; verify from an extension page.
    await page.waitForTimeout(1500);
    const probe = await context.newPage();
    await probe.goto(`chrome-extension://${id}/popup.html`);
    const windowCount = await probe.evaluate(
      () => new Promise<number>((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.windows.getAll((wins) => resolve((wins || []).length));
      }),
    );
    await probe.close();
    expect(windowCount).toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
    server.close();
  }
});

test('tipping with an unreachable hub surfaces an error, never crashes', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(ARTICLE);
  });
  await new Promise<void>((r) => server.listen(3094, '0.0.0.0', r));
  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-ext-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  try {
    let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    for (let i = 0; i < 20 && !sw; i++) { await new Promise((r) => setTimeout(r, 500)); sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')); }
    const id = new URL(sw!.url()).hostname;
    const popup = await openPopupReady(context, id);
    await popup.evaluate(
      (pw) => new Promise((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.runtime.sendMessage({ type: 'VAULT_CREATE', password: pw }, resolve);
      }),
      'e2e-nohub-password',
    );
    await popup.evaluate(
      () => new Promise((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.storage.local.set({ nibgateCustomHubApi: 'http://localhost:3999', nibgateNetwork: 'testnet' }, () => resolve(null));
      }),
    );
    await popup.close();

    const page = await context.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(`http://${lanIp()}:3094/post`);
    const card = page.locator('#nibgate-card');
    await expect(card).toHaveCount(1, { timeout: 30000 });
    await card.getByRole('button', { name: '$1', exact: true }).click();
    await expect(card.locator('[data-tip-status]')).toContainText(/failed/i, { timeout: 30000 });
    // Card stays interactive; no crash.
    await expect(card.getByRole('button', { name: '$1', exact: true })).toBeVisible();
  } finally {
    await context.close();
    server.close();
  }
});

test('wallet stays unlocked after the popup closes (session persistence)', async () => {
  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-ext-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  try {
    let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    for (let i = 0; i < 20 && !sw; i++) { await new Promise((r) => setTimeout(r, 500)); sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')); }
    const id = new URL(sw!.url()).hostname;

    const page = await openPopupReady(context, id);
    await createWalletViaUi(page);
    await expect(page.locator('#balance')).toBeVisible();
    await page.close();

    // Reopen: the session secret lives in chrome.storage.session, so the
    // wallet stays unlocked across the popup close (as long as idle TTL holds).
    const reopened = await openPopupReady(context, id);
    await expect(reopened.locator('#balance')).toBeVisible({ timeout: 15000 });
    await expect(reopened.locator('#screen-lock')).toBeHidden();
  } finally {
    await context.close();
  }
});

test('popup renders wallet home (balances, tabs, actions, activity)', async () => {
  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-ext-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  try {
    let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    for (let i = 0; i < 20 && !sw; i++) {
      await new Promise((r) => setTimeout(r, 500));
      sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    }
    expect(sw).toBeDefined();
    const id = new URL(sw!.url()).hostname;
    const page = await openPopupReady(context, id);
    await createWalletViaUi(page);
    await expect(page.locator('#balance')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wallet', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gateway', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Receive', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(page.locator('#screen-activity')).toBeVisible();
    await expect(page.locator('#history-full')).toContainText('No activity yet');
    await page.locator('#nav-settings').click();
    await expect(page.locator('#net-testnet')).toBeVisible();
    await page.locator('#nav-home').click();
    await page.locator('#btn-receive').dispatchEvent('click');
    await expect(page.locator('#screen-receive')).toBeVisible();
    await expect(page.locator('#receive-addr')).not.toHaveText('—');
    await expect(page.locator('#qr svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy address' })).toBeVisible();
    // Back home, then switch balance rail for the artifact screenshot.
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Gateway', exact: true }).click();
    await page
      .screenshot({ path: 'e2e/screenshots/extension-popup.png', timeout: 10000 })
      .catch(() => {});
  } finally {
    await context.close();
  }
});

test('popup onboards an embedded wallet (create + backup)', async () => {
  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-ext-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  try {
    let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    for (let i = 0; i < 20 && !sw; i++) {
      await new Promise((r) => setTimeout(r, 500));
      sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    }
    const id = new URL(sw!.url()).hostname;
    const page = await openPopupReady(context, id);
    await page.getByRole('button', { name: 'Create a new wallet' }).click();
    await page.locator('#new-password').fill('e2e-test-password');
    await page.locator('#new-password').press('Enter');
    await page.locator('#ob-mnemonic span').first().waitFor({ timeout: 30000 });
    expect(await page.locator('#ob-mnemonic span').count()).toBe(12);
    await page.locator('#ob-saved').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    const addr = page.locator('#acctaddr');
    await expect(addr).not.toContainText('No wallet');
    expect(await addr.textContent()).toMatch(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/i);
    await page.screenshot({ path: 'e2e/screenshots/extension-onboarded.png', timeout: 10000 }).catch(() => {});
  } finally {
    await context.close();
  }
});
