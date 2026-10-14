import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';

function harness() {
  const source = fs.readFileSync(new URL('../src/background/service-worker.ts', import.meta.url), 'utf8');
  const calls = [], errors = [], events = {};
  const chrome = {
    runtime: { getURL: p => `chrome-extension://test/${p}`, onInstalled: { addListener: f => events.install = f }, onStartup: { addListener: f => events.startup = f } },
    contextMenus: { removeAll: f => f(), create: options => events.menu = options, onClicked: { addListener: f => events.click = f } },
    windows: { create: async options => errors.push(options) },
  };
  vm.runInNewContext(ts.transpileModule(source.slice(source.indexOf('const TIP_URL_MENU')), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { chrome, URL, openTip: async input => calls.push(input) });
  return { calls, errors, events };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('install and startup register the HTTP(S) page/link menu', () => {
  const { events } = harness();
  events.install();
  assert.equal(events.menu.title, 'Tip this page');
  assert.deepEqual(Array.from(events.menu.contexts), ['page', 'link']);
  events.startup();
  assert.equal(events.menu.id, 'nibgate-tip-url');
});
test('explicit page action works without creator eligibility or site access', async () => {
  const { calls, errors, events } = harness();
  events.click({ menuItemId: 'nibgate-tip-url', pageUrl: 'https://example.org/app?x=1#section' }, { title: 'An ordinary app' });
  await flush();
  assert.equal(calls[0].content.canonicalUrl, 'https://example.org/app?x=1');
  assert.equal(calls[0].content.title, 'An ordinary app');
  assert.equal(calls[0].pageWallet, undefined);
  assert.equal(errors.length, 0);
});
test('link action tips the linked URL without inheriting referring-page attribution', async () => {
  const { calls, events } = harness();
  events.click({ menuItemId: 'nibgate-tip-url', linkUrl: 'https://owner.example/work', pageUrl: 'https://other.example/' }, { title: 'Other creator' });
  await flush();
  assert.equal(calls[0].content.url, 'https://owner.example/work');
  assert.equal(calls[0].content.siteName, 'owner.example');
  assert.equal(calls[0].content.author, '');
  assert.equal(calls[0].content.title, 'https://owner.example/work');
});
test('unsupported URLs show an extension error and never open a payment', async () => {
  const { calls, errors, events } = harness();
  events.click({ menuItemId: 'nibgate-tip-url', linkUrl: 'javascript:alert(1)' }, {});
  await flush();
  assert.equal(calls.length, 0);
  assert.match(errors[0].url, /tip\.html\?error=/);
});
