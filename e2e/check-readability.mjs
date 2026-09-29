// One-off: does Mozilla Readability treat a URL as an article?
// Usage: node e2e/check-readability.mjs <url>
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.argv[2];
if (!url) {
  console.error('usage: node check-readability.mjs <url>');
  process.exit(2);
}
const readPath = path.resolve('extension/node_modules/@mozilla/readability/Readability.js');
const readerablePath = path.resolve('extension/node_modules/@mozilla/readability/Readability-readerable.js');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.addScriptTag({ path: readPath });
  await page.addScriptTag({ path: readerablePath });
  const out = await page.evaluate(() => {
    const w = window;
    const readerable = typeof w.isProbablyReaderable === 'function'
      ? w.isProbablyReaderable(document, { minContentLength: 240, minScore: 24 })
      : null;
    let title = null;
    let length = null;
    try {
      const parsed = w.Readability ? new w.Readability(document.cloneNode(true)).parse() : null;
      title = parsed?.title ?? null;
      length = parsed?.length ?? null;
    } catch (e) {
      title = `ERR: ${e.message}`;
    }
    const words = (document.body?.innerText || '').trim().split(/\s+/).filter(Boolean).length;
    return { readerable, title, length, pageWords: words };
  });
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
