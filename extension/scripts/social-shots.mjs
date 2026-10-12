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
const TIP_FRAME_CSS = 'html,body{width:100% !important;height:100% !important;min-height:100% !important;margin:0 !important;padding:0 !important;}body{display:flex !important;flex-direction:row !important;align-items:center !important;justify-content:center !important;background:radial-gradient(1000px 600px at 50% 30%, #e9e9e1 0%, #f4f4f0 55%, #eceae2 100%) !important;}.wrap{width:360px !important;max-width:none !important;height:600px !important;min-height:600px !important;justify-content:center !important;padding:24px 14px !important;background:#f4f4f0 !important;border-radius:12px !important;box-shadow:0 24px 64px rgba(0,0,0,.25) !important;overflow:hidden !important;}';

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
  {
    url: 'https://danluu.com/agentic-testing/',
    image: 'blog-dan-luu.png',
    extra: true,
  },
  {
    url: 'https://www.joelonsoftware.com/2022/12/19/progress-on-the-block-protocol/',
    image: 'blog-joel-spolsky.png',
    extra: true,
  },
  {
    url: 'https://waitbutwhy.com/2015/01/artificial-intelligence-revolution-1.html',
    image: 'blog-wait-but-why.png',
    extra: true,
  },
  {
    url: 'https://ciechanow.ski/moon/',
    image: 'blog-bartosz-ciechanowski.png',
    extra: true,
  },
  {
    url: 'https://fasterthanli.me/articles/a-half-hour-to-learn-rust',
    image: 'blog-faster-than-lime.png',
    extra: true,
  },
  {
    url: 'https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html',
    image: 'blog-matklad.png',
    extra: true,
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

  let extraCaptured = 0;
  for (const blog of BLOGS) {
    if (blog.extra && extraCaptured >= 5) break;
    const page = await context.newPage();
    const response = await page.goto(blog.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!response || response.status() >= 400) {
      if (blog.extra) {
        console.warn(`Skipping unavailable public blog (${response?.status() ?? 'no response'}): ${blog.url}`);
        await page.close();
        continue;
      }
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
      if (blog.extra) {
        console.warn(`Skipping page without an eligible tip button: ${blog.url} ${JSON.stringify(assessment)}`);
        await page.close();
        continue;
      }
      throw new Error(`Tip button did not appear on ${blog.url}: ${JSON.stringify(assessment)}`);
    }
    await card.locator('[data-open-tip]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, blog.image) });
    if (blog.extra) extraCaptured++;

    if (blog === BLOGS[0]) {
      const tipWindow = context.waitForEvent('page', {
        predicate: (candidate) => candidate.url().includes('/tip.html'),
        timeout: 30000,
      });
      await card.locator('[data-open-tip]').click();
      const tipPage = await tipWindow;
      await tipPage.locator('.wrap').waitFor({ timeout: 20000 });
      await tipPage.setViewportSize({ width: 1440, height: 1000 });
      await tipPage.addStyleTag({ content: TIP_FRAME_CSS });
      await tipPage.waitForFunction(() => {
        const main = document.querySelector('#main');
        const amount = document.querySelector('#step-amount');
        const review = document.querySelector('#t-review');
        const button = document.querySelector('#t-continue');
        return main && !main.hidden && amount && !amount.hidden && review?.hidden
          && button?.textContent?.trim() === 'Continue';
      });
      await tipPage.screenshot({ path: path.join(SHOTS, 'tip-amount.png') });

      const holdNote = tipPage.locator('#t-note');
      if (await holdNote.isVisible() && (await holdNote.textContent() || '').includes('not on Nibgate yet')) {
        await tipPage.screenshot({ path: path.join(SHOTS, 'tip-unlisted-creator.png') });
      }

      await tipPage.getByRole('button', { name: '$5', exact: true }).click();
      await tipPage.getByRole('button', { name: 'Continue', exact: true }).click();
      await tipPage.getByRole('button', { name: 'Approve & pay', exact: true }).waitFor({ timeout: 90000 });
      await tipPage.screenshot({ path: path.join(SHOTS, 'tip-review.png') });
      await tipPage.close();
    }
    await page.close();
  }
  if (extraCaptured < 5) throw new Error(`Captured only ${extraCaptured} of 5 additional eligible blog pages.`);

  const canteenPage = await context.newPage();
  const canteenUrl = 'https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html';
  const canteenResponse = await canteenPage.goto(canteenUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!canteenResponse || canteenResponse.status() >= 400) {
    throw new Error(`Could not load Canteen's public blog page (${canteenResponse?.status() ?? 'no response'}): ${canteenUrl}`);
  }
  const canteenCard = canteenPage.locator('#nibgate-card');
  try {
    await canteenCard.waitFor({ state: 'visible', timeout: 60000 });
  } catch {
    const assessment = await canteenPage.evaluate(() => ({
      title: document.title,
      assessed: document.documentElement.dataset.nibgateAssessed,
      kind: document.documentElement.dataset.nibgateKind,
      type: document.documentElement.dataset.nibgateType,
      eligible: document.documentElement.dataset.nibgateEligible,
      reason: document.documentElement.dataset.nibgateReason,
    }));
    throw new Error(`Canteen's blog has no eligible tip button: ${JSON.stringify(assessment)}`);
  }
  await canteenCard.locator('[data-open-tip]').scrollIntoViewIfNeeded();
  await canteenPage.waitForTimeout(500);
  await canteenPage.screenshot({ path: path.join(SHOTS, 'blog-canteen.png') });

  const canteenTipWindow = context.waitForEvent('page', {
    predicate: (candidate) => candidate.url().includes('/tip.html'),
    timeout: 30000,
  });
  await canteenCard.locator('[data-open-tip]').click();
  const canteenTipPage = await canteenTipWindow;
  await canteenTipPage.locator('.wrap').waitFor({ timeout: 20000 });
  await canteenTipPage.setViewportSize({ width: 1440, height: 1000 });
  await canteenTipPage.addStyleTag({ content: TIP_FRAME_CSS });
  await canteenTipPage.waitForFunction(() => {
    const main = document.querySelector('#main');
    const amount = document.querySelector('#step-amount');
    const review = document.querySelector('#t-review');
    const button = document.querySelector('#t-continue');
    return main && !main.hidden && amount && !amount.hidden && review?.hidden
      && button?.textContent?.trim() === 'Continue';
  });
  await canteenTipPage.screenshot({ path: path.join(SHOTS, 'tip-canteen-amount.png') });
  await canteenTipPage.getByRole('button', { name: '$5', exact: true }).click();
  await canteenTipPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await canteenTipPage.getByRole('button', { name: 'Approve & pay', exact: true }).waitFor({ timeout: 90000 });
  await canteenTipPage.screenshot({ path: path.join(SHOTS, 'tip-canteen-review.png') });
  await canteenTipPage.close();
  await canteenPage.close();

  console.log(`Real-blog and extension screenshots saved to ${SHOTS}`);
} finally {
  await context.close();
  await rm(TEMP_ROOT, { recursive: true, force: true });
}
