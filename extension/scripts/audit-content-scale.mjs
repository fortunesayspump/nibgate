// Broad public-HTML audit. Feed URLs are weak labels, not human ground truth.
// No remote scripts/media execute. Full HTML and reports stay in ignored e2e/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const cache = path.resolve(root, '../e2e/content-scale');
const sources = path.resolve(root, '../e2e/content-corpus');
await mkdir(cache, { recursive: true });
await mkdir(sources, { recursive: true });
async function source(name, url) {
  const filename = path.join(sources, name);
  let text;
  try { text = await readFile(filename, 'utf8'); }
  catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Directory HTTP ${response.status}`);
    text = await response.text();
    await writeFile(filename, text);
  }
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error('Invalid directory');
  return rows;
}
const all = await source('blogs-hn.json', 'https://raw.githubusercontent.com/surprisetalk/blogs.hn/main/blogs.json');
const directory = await source('directory.json', 'https://raw.githubusercontent.com/rtdev-com/swe-blog-directory/main/data.json');
const takeSpread = (rows, count) => Array.from({ length: Math.min(count, rows.length) }, (_, i) => rows[Math.floor(i * rows.length / count)]);
const media = all.filter((row) => row.feed && /photograph|photoblog|musician|music|filmmaker|artist|illustrat|drawing|poet/i.test(`${row.title} ${row.desc || ''}`));
const seedRows = [
  ...takeSpread(media, 35).map((row) => ({ ...row, group: 'media-creator-directory' })),
  ...takeSpread(directory, 35).map((row) => ({ ...row, feed: row.rss, group: 'software-blog-directory' })),
  ...takeSpread(all.filter((row) => row.feed), 90).map((row) => ({ ...row, group: 'general-blog-directory' })),
];
const seen = new Set();
const seeds = seedRows.filter((row) => { try { const host = new URL(row.url).hostname; if (seen.has(host)) return false; seen.add(host); return true; } catch { return false; } });
const bundled = await build({ entryPoints: ['src/content/page-model.ts'], absWorkingDir: root, bundle: true, write: false, format: 'iife', globalName: 'NibgateModel', target: 'es2022' });
const code = bundled.outputFiles[0].text + '\nwindow.__model = NibgateModel;';
const virtualConsole = new VirtualConsole();
const results = [];
const issues = [];
const cacheOnly = process.argv.includes('--replay');
const key = (url) => createHash('sha256').update(url).digest('hex');
function publicUrl(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password
    || /(^localhost$|\.(local|internal|test|localhost)$|^\d+\.\d+\.\d+\.\d+$|:)/i.test(url.hostname)) throw new Error('Not a public website URL');
  return url;
}
async function get(url) {
  const filename = path.join(cache, key(url) + '.html');
  try { return await readFile(filename, 'utf8'); } catch {}
  if (cacheOnly) throw new Error('Unavailable in the original download sample');
  let current = publicUrl(url);
  for (let redirect = 0; redirect < 5; redirect++) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'NibgateContentAudit/1.2.1 (public HTML compatibility testing)' } });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) { current = publicUrl(new URL(response.headers.get('location'), current)); continue; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 2000000) throw new Error('Page too large for this audit');
    await writeFile(filename, text);
    return text;
  }
  throw new Error('Too many redirects');
}
function inspect(html, url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole });
  const { window } = dom;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() {
    const clone = this.cloneNode(true);
    clone.querySelectorAll('script,style,template,noscript,[hidden],[aria-hidden="true"]').forEach((el) => el.remove());
    return clone.textContent;
  } });
  window.eval(code);
  const map = window.__model.mapPage();
  const detected = map.kind === 'content' && map.eligibility?.kind === 'select';
  const reader = window.document.body.innerText.replace(/\s+/g, ' ').trim();
  const out = { detected, kind: map.kind, type: map.contentType, title: map.title || window.document.title, words: map.wordCount, trace: map.trace,
    excerpt: reader.slice(0, 1200), paragraphs: window.document.querySelectorAll('p').length,
    images: window.document.querySelectorAll('main img,article img,.h-entry img').length,
    media: window.document.querySelectorAll('audio,video,iframe').length };
  dom.window.close();
  return out;
}
function feedPosts(xml, seed) {
  const dom = new JSDOM(xml, { contentType: 'text/xml', url: seed.feed, virtualConsole });
  const host = new URL(seed.url).hostname.replace(/^www\./, '');
  const urls = [];
  for (const item of dom.window.document.querySelectorAll('item, entry')) {
    const atom = [...item.querySelectorAll('link')].find((link) => link.getAttribute('href') && (!link.getAttribute('rel') || link.getAttribute('rel') === 'alternate'));
    const link = atom?.getAttribute('href') || item.querySelector('link')?.textContent?.trim();
    if (!link) continue;
    try {
      const url = publicUrl(new URL(link, seed.url));
      if (url.hostname.replace(/^www\./, '') !== host) continue;
      if (!urls.includes(url.href)) urls.push(url.href);
    } catch {}
    if (urls.length >= 2) break;
  }
  dom.window.close();
  return urls;
}
async function check(seed) {
  try {
    const html = await get(seed.url);
    results.push({ url: seed.url, group: seed.group, label: 'unreviewed-home', ...inspect(html, seed.url) });
  } catch (error) { issues.push({ url: seed.url, stage: 'home', error: error.message }); }
  let posts;
  try { posts = feedPosts(await get(seed.feed), seed); }
  catch (error) { issues.push({ url: seed.feed, stage: 'feed', error: error.message }); return; }
  for (const url of posts) {
    try { results.push({ url, group: seed.group, label: 'feed-published-post', ...inspect(await get(url), url) }); }
    catch (error) { issues.push({ url, stage: 'post', error: error.message }); }
  }
}
let cursor = 0;
let finished = 0;
console.log(`Sampling ${seeds.length} sites; up to ${seeds.length * 3} pages (35 media creators before deduplication).`);
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < seeds.length) {
    const seed = seeds[cursor++];
    await check(seed);
    finished++;
    if (finished % 10 === 0) {
      console.log(`Progress: ${finished}/${seeds.length} sites; ${results.length} pages inspected; ${issues.length} unavailable requests.`);
      await writeFile(path.join(cache, 'results.json'), JSON.stringify({ results, issues }, null, 2));
    }
  }
}));
const posts = results.filter((row) => row.label === 'feed-published-post');
const summary = { sitesSampled: seeds.length, pagesInspected: results.length, feedPosts: posts.length, postsDetected: posts.filter((row) => row.detected).length, postsMissed: posts.filter((row) => !row.detected).length, homePages: results.length - posts.length, unavailableRequests: issues.length, types: Object.fromEntries([...new Set(posts.map((row) => row.type))].map((type) => [type, posts.filter((row) => row.type === type).length])), methodology: 'Feed-published posts are weak positive labels. Homepages are unreviewed. This is coverage testing, not a human-reviewed accuracy score.' };
await writeFile(path.join(cache, 'results.json'), JSON.stringify({ summary, results, issues }, null, 2));
console.log(JSON.stringify(summary, null, 2));
