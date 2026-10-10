// Run from the repo root after building; capture real public blogs in a clean browser profile.
// The temporary manifest pre-grants optional site access for the capture only.
// No tip is approved or submitted.
import { chromium } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

const SOURCE_EXT = path.resolve('extension/dist');
const SHOTS = path.resolve('e2e/screenshots/social');
const TEMP_ROOT = await mkdtemp(path.join(os.tmpdir(), 'nib-social-'));
const EXT_PATH = path.join(TEMP_ROOT, 'extension');
const USER_DATA = path.join(TEMP_ROOT, 'profile');
const FRAME_CSS = 'html,body{width:100% !important;height:100% !important;}body{display:flex !important;align-items:center !important;justify-content:center !important;min-height:100vh !important;margin:0 !important;background:radial-gradient(1000px 600px at 50% 30%, #e9e9e1 0%, #f4f4f0 55%, #eceae2 100%) !important;}#app{position:relative !important;width:360px !important;height:600px !important;flex:none !important;box-shadow:0 24px 64px rgba(0,0,0,.25);border-radius:12px;overflow:hidden;}';

const BLOGS = [
  {
    url: 'https://oleb.net/2025/git-mv-case-change/',
    image: 'blog-ole-begemann.png',
  },
  {
    url: 'https://blog.paulhankin.net/fibonacci_doubling/',
    image: 'blog-paul-hankin.png',
  },
  {
    url: 'https://blog.scottlogic.com/2026/08/18/want-to-use-ai-agents-safely-start-with-design.html',
    image: 'blog-scott-logic.png',
  },
];

await mkdir(SHOTS, { recursive: true });
await cp(SOURCE_EXT, EXT_PATH, { recursive: true });

const manifestPath = path.join(EXT_PATH, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = [...new Set([
  ...manifest.host_permissions,
  ...manifest.optional_host_permissions,
])];
manifest.optional_host_permissions = [];
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const context = await chromium.launchPersistentContext(USER_DATA, {
  headless: false,
  viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
});

try {
  let worker;
  for (let i = 0; i < 30 && !worker; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    worker = context.serviceWorkers().find((item) => item.url().startsWith('chrome-extension://'));
  }
  if (!worker) throw new Error('Nibgate extension worker did not start. Build extension/dist first.');
  const extensionId = new URL(worker.url()).hostname;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#screen-onboard').waitFor({ timeout: 20000 });
  const created = await popup.evaluate((password) => new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'VAULT_CREATE', password }, resolve);
  }), 'local-social-demo-password');
  if (!created?.ok) throw new Error('Could not create the temporary demo wallet.');
  await popup.reload();
  await popup.locator('#screen-home').waitFor({ timeout: 20000 });
  await popup.waitForFunction(() => {
    const address = document.getElementById('acctaddr')?.textContent || '';
    const balance = document.getElementById('balance')?.textContent || '';
    return address !== 'No wallet' && address.length > 0 && balance !== '—' && balance.length > 0;
  }, { timeout: 60000 });
  await popup.addStyleTag({ content: FRAME_CSS });
  await popup.waitForTimeout(700);
  await popup.screenshot({ path: path.join(SHOTS, 'wallet-home.png') });

  await popup.locator('#nav-activity').click();
  await popup.screenshot({ path: path.join(SHOTS, 'wallet-activity.png') });
  await popup.locator('#nav-settings').click();
  await popup.screenshot({ path: path.join(SHOTS, 'wallet-settings.png') });
  await popup.locator('#nav-home').click();
  await popup.locator('#netpill').click();
  await popup.locator('#netmenu').waitFor();
  await popup.screenshot({ path: path.join(SHOTS, 'wallet-network-menu.png') });
  await popup.locator('#netpill').click();
  await popup.getByRole('button', { name: 'Receive', exact: true }).click();
  await popup.locator('#qr svg').waitFor({ timeout: 15000 });
  await popup.screenshot({ path: path.join(SHOTS, 'wallet-receive.png') });
  await popup.close();

  for (const blog of BLOGS) {
    const page = await context.newPage();
    const response = await page.goto(blog.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!response || response.status() >= 400) {
      throw new Error(`Could not load public blog page (${response?.status() ?? 'no response'}): ${blog.url}`);
    }
    const card = page.locator('#nibgate-card');
    try {
      await card.waitFor({ state: 'visible', timeout: 60000 });
    } catch {
      const assessment = await page.evaluate(() => ({
        title: document.title,
        assessed: document.documentElement.dataset.nibgateAssessed,
        kind: document.documentElement.dataset.nibgateKind,
        type: document.documentElement.dataset.nibgateType,
        eligible: document.documentElement.dataset.nibgateEligible,
        reason: document.documentElement.dataset.nibgateReason,
      }));
      throw new Error(`Tip button did not appear on ${blog.url}: ${JSON.stringify(assessment)}`);
    }
    await card.locator('[data-open-tip]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, blog.image) });

    if (blog === BLOGS[0]) {
      const tipWindow = context.waitForEvent('page', {
        predicate: (candidate) => candidate.url().includes('/tip.html'),
        timeout: 30000,
      });
      await card.locator('[data-open-tip]').click();
      const tipPage = await tipWindow;
      await tipPage.locator('.wrap').waitFor({ timeout: 20000 });
      await tipPage.locator('.wrap').screenshot({ path: path.join(SHOTS, 'tip-amount.png') });

      const holdNote = tipPage.locator('#t-note');
      if (await holdNote.isVisible() && (await holdNote.textContent() || '').includes('not on Nibgate yet')) {
        await tipPage.locator('.wrap').screenshot({ path: path.join(SHOTS, 'tip-unlisted-creator.png') });
      }

      await tipPage.getByRole('button', { name: '$5', exact: true }).click();
      await tipPage.getByRole('button', { name: 'Continue', exact: true }).click();
      await tipPage.getByRole('button', { name: 'Approve & pay', exact: true }).waitFor({ timeout: 90000 });
      await tipPage.locator('.wrap').screenshot({ path: path.join(SHOTS, 'tip-review.png') });
      await tipPage.close();
    }
    await page.close();
  }
  console.log(`Real-blog and extension screenshots saved to ${SHOTS}`);
} finally {
  await context.close();
  await rm(TEMP_ROOT, { recursive: true, force: true });
}
