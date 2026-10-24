import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
const serviceWorkerSource = fs.readFileSync(new URL('../src/background/service-worker.ts', import.meta.url), 'utf8');

function harness() {
  const source = serviceWorkerSource;
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

test('tip execution is bound to the reviewed challenge, network, and wallet', () => {
  const execute = serviceWorkerSource.slice(
    serviceWorkerSource.indexOf("if (msg?.type === 'TIP_EXECUTE')"),
    serviceWorkerSource.indexOf("if (msg?.type === 'TIP_CANCEL')"),
  );
  assert.match(execute, /p\.approval\.challenge/);
  assert.match(execute, /Network changed after review/);
  assert.match(execute, /Wallet changed after review/);
  assert.match(serviceWorkerSource, /challenge: structuredClone\(/);
});

test('submitted tip proofs are persisted before hub verification and recoverable', () => {
  const flow = serviceWorkerSource.slice(
    serviceWorkerSource.indexOf('async function tipConfirmFlow'),
    serviceWorkerSource.indexOf('async function notOk'),
  );
  for (const endpoint of ['/hub/tips/hold', '/hub/tips/verify']) {
    const verifyAt = flow.indexOf(`fetch(\`${'${net.hubApi}'}${endpoint}`);
    const persistAt = flow.lastIndexOf('persistPendingTipProof', verifyAt);
    assert.ok(verifyAt > 0 && persistAt > 0 && persistAt < verifyAt, `${endpoint} proof must be persisted before verification`);
  }
  assert.match(serviceWorkerSource, /retryPendingTipProofs\(\)\.catch/);
  assert.match(serviceWorkerSource, /Once money has moved or a Gateway authorization exists/);
});

test('proof recovery replays the exact request and clears only after success', async () => {
  const start = serviceWorkerSource.indexOf("const PENDING_TIP_PROOFS_KEY");
  const end = serviceWorkerSource.indexOf('async function openTip', start);
  const journalSource = serviceWorkerSource.slice(start, end).replace('retryPendingTipProofs().catch(() => {});', '');
  const journal = `${journalSource}\nglobalThis.__journal = { retryPendingTipProof, retryPendingTipProofs };`;
  const stored = {
    nibgatePendingTipProofs: {
      tip1: {
        url: 'https://hub.test/hub/tips/verify',
        headers: { 'content-type': 'application/json', 'payment-signature': 'proof-1' },
        body: { contentUrl: 'https://creator.test/post', amount: '1', paymentSignature: 'proof-1' },
        result: { held: false, amount: '1', paymentSignature: 'proof-1' },
      },
    },
    history: [],
  };
  const writes = [];
  const chrome = { storage: { local: {
    get: async key => key === 'history' ? { history: stored.history } : { [key]: stored[key] },
    set: async value => { writes.push(structuredClone(value)); Object.assign(stored, structuredClone(value)); },
  } } };
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init: structuredClone(init) });
    return { ok: true, json: async () => ({ receipt: { id: 'receipt-1' } }) };
  };
  const recordReceipt = async receipt => {
    stored.history = [structuredClone(receipt), ...stored.history].slice(0, 100);
    writes.push({ history: structuredClone(stored.history) });
  };
  const notOk = async (_response, label) => new Error(`${label} failed`);
  const context = { chrome, fetch, notOk, recordReceipt, structuredClone, JSON, globalThis: {} };
  vm.runInNewContext(ts.transpileModule(journal, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const result = await context.globalThis.__journal.retryPendingTipProof('tip1');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://hub.test/hub/tips/verify');
  assert.equal(requests[0].init.headers['payment-signature'], 'proof-1');
  assert.equal(JSON.parse(requests[0].init.body).paymentSignature, 'proof-1');
  assert.equal(result.receipt.id, 'receipt-1');
  assert.deepEqual(Object.keys(stored.nibgatePendingTipProofs), []);
  assert.ok(writes.some(value => value.history?.[0]?.status === 'settled'));

  stored.nibgatePendingTipProofs.tip2 = structuredClone({
    url: 'https://hub.test/hub/tips/hold', headers: { 'payment-signature': 'proof-2' },
    body: { paymentSignature: 'proof-2' }, result: { held: true },
  });
  context.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(context.globalThis.__journal.retryPendingTipProof('tip2'), /tip proof recovery failed/);
  assert.equal(stored.nibgatePendingTipProofs.tip2.body.paymentSignature, 'proof-2');
});
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
