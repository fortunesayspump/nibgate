import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const [base = 'http://localhost:3131', app = 'hub'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (app === 'blog') await context.addInitScript(() => localStorage.setItem('token', 'synthetic-browser-fixture'));
  await page.route('**/nibshare/me', route => route.fulfill({json: {authenticated: false}}));
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'GET') return route.fulfill({status: 403, json: {error: 'Writes disabled in browser smoke test'}});
    return route.continue();
  });
  const response = await page.goto(`${base}${app === 'blog' ? '/admin/posts/new' : '/share'}`, {waitUntil: 'domcontentloaded'});
  assert.equal(response.status(), 200);
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.waitFor({state: 'visible', timeout: 45000});
  await editor.fill('Workspace smoke');
  await editor.press('Control+A');
  await page.locator('button[title="Bold"]').first().click();
  assert.equal(await editor.locator('strong').textContent(), 'Workspace smoke');
  assert.deepEqual(errors, []);
  console.log(`${app}: built page renders, editor typing/formatting works, no browser exceptions.`);
  await page.goto(`${base}${app === 'blog' ? '/admin/login' : '/signin'}`, {waitUntil: 'domcontentloaded'});
  await page.locator('body').waitFor();
  assert.deepEqual(errors, []);
  console.log(`${app}: sign-in UI renders without provider/context exceptions.`);
} finally { await browser.close(); }
