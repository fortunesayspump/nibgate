// Public HTML only. Remote scripts, frames, images, and tracking never execute.
// Downloads and reports go in ignored e2e/, not into Git history.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fixture } from './content-test-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const corpus = path.resolve(root, '../e2e/content-corpus');
await mkdir(corpus, { recursive: true });
const pages = [
  ['mxb', 'https://mxb.dev/blog/media-queries-in-times-of-container-queries/', true],
  ['nelson', 'https://nelson.cloud/you-can-hide-languages-from-githubs-languages-bar/', true],
  ['dom', 'https://blog.ctms.me/posts/2026-07-15-being-away-from-computers/', true],
  ['florian-post', 'https://florian.photo/2026-10-13', true],
  ['tom-music-video', 'https://www.tomrayswebsite.com/posts/documenting-my-bands-new-song/', true],
  ['kristoffer-video', 'https://kristofferlislegaard.com/blog/2026-02-18-live-at-ekko-video/', true],
  ['kristoffer-audio', 'https://kristofferlislegaard.com/blog/2026-04-16-oy-rehearsal-2026-03-19', true],
  ['nelson-index', 'https://nelson.cloud/', false],
  ['dom-index', 'https://blog.ctms.me/', false],
  ['random-directory', 'https://randomblog.rocks/', false],
];
const result = await build({ entryPoints: ['src/content/page-model.ts'], absWorkingDir: root, bundle: true, write: false, format: 'iife', globalName: 'NibgatePageModel', target: 'es2022' });
const code = result.outputFiles[0].text;
const report = [];
for (const [name, url, expected] of pages) {
  try {
    const filename = path.join(corpus, `${name}.html`);
    let html;
    try { html = await readFile(filename, 'utf8'); }
    catch {
      const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
      await writeFile(filename, html);
    }
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
    const { window } = dom;
    Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() {
      const clone = this.cloneNode(true);
      clone.querySelectorAll('script,style,template,noscript,[hidden],[aria-hidden="true"]').forEach((el) => el.remove());
      return clone.textContent;
    } });
    window.eval(code + '\nwindow.__nibgateModel = NibgatePageModel;');
    const mapped = window.__nibgateModel.mapPage();
    const detected = mapped.kind === 'content' && mapped.eligibility?.kind === 'select';
    const renderedPage = fixture(window.document.body.innerHTML, window.document.head.innerHTML);
    await renderedPage.tick(0);
    const rendered = Boolean(renderedPage.host());
    if (rendered) {
      renderedPage.host().shadowRoot.querySelector('[data-dismiss-tip]').click();
      await renderedPage.tick(11000);
      if (renderedPage.host()) throw new Error('Dismissed control reappeared');
    }
    renderedPage.close();
    report.push({ name, url, expected, detected, rendered, pass: detected === expected && rendered === expected, kind: mapped.kind, type: mapped.contentType, words: mapped.wordCount, trace: mapped.trace });
    console.log(`${detected === expected && rendered === expected ? 'PASS' : 'FAIL'} ${name}: ${mapped.kind}/${mapped.contentType}, detected=${detected}, rendered=${rendered}`);
    dom.window.close();
  } catch (error) {
    report.push({ name, url, expected, error: error.message });
    console.log(`UNAVAILABLE ${name}: ${error.message}`);
  }
}
await writeFile(path.join(corpus, 'audit.json'), JSON.stringify(report, null, 2));
if (report.some((row) => row.pass === false || row.error)) process.exitCode = 1;
