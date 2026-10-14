// Offline adapter/UI harness: actual source + audited transaction engine, with
// DOM, viem, wallet RPC and network helpers stubbed. No live network or wallet.
import assert from 'node:assert/strict';
import { readFile } from './test-source.mjs';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import * as engine from '../packages/wallet/src/gateway-transactions.js';

const source = (await readFile(new URL('../packages/nibgate/src/browser/gateway-transfer.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace('export function ', 'function ');
const address = `0x${'1'.repeat(40)}`;
const other = `0x${'2'.repeat(40)}`;
const approval = `0x${'a'.repeat(64)}`;
const deposit = `0x${'b'.repeat(64)}`;
const chain = (id) => ({ id, caip2: `eip155:${id}`, name: id === 5042 ? 'Arc' : 'Arc Testnet', rpcUrl: `https://rpc-${id}.invalid`, nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 } });

function harness({ network = 'eip155:5042002', ...overrides } = {}) {
  const events = [], records = new Map(), transactions = new Map();
  let account = address, selected, mounted = true, waiting, resume;
  const provider = new EventEmitter();
  provider.request = async ({ method, params }) => {
    events.push({ method, params });
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return `0x${Number(network.split(':')[1]).toString(16)}`;
    if (method === 'eth_sendTransaction') {
      const hash = params[0].data.startsWith('0x095ea7b3') ? approval : deposit;
      transactions.set(hash, { ...params[0], hash, input: params[0].data, value: 0n });
      return hash;
    }
    throw Error(`unexpected ${method}`);
  };
  selected = provider;
  const dependencies = {
    ...engine,
    ARC_MAINNET: chain(5042), ARC_TESTNET: chain(5042002),
    http: (url) => url,
    createPublicClient: (config) => {
      assert.equal(config.chain.id, Number(network.split(':')[1]));
      return {
        waitForTransactionReceipt: async ({ hash, checkReplacement }) => {
          assert.equal(checkReplacement, false);
          if (waiting && hash === approval) { waiting(); await new Promise((resolve) => { resume = resolve; }); }
          return { transactionHash: hash, status: 'success' };
        },
        getTransaction: async ({ hash }) => transactions.get(hash),
      };
    },
    createGatewayTransferStore: () => ({ read: (key) => records.get(key) || null, write: (key, value) => records.set(key, structuredClone(value)), clear: (key) => records.delete(key) }),
    ensureArcNetwork: async (p, { chain: target }) => { assert.equal(p, provider); events.push({ health: 'ensure', chainId: target.id }); },
    checkArcConnection: async (p, { chain: target }) => { assert.equal(p, provider); events.push({ health: 'check', chainId: target.id }); },
    repairArcNetwork: async (p, { chain: target, assertActive }) => { assert.equal(p, provider); assertActive(); events.push({ repair: target.id }); },
    getWalletErrorMessage: () => 'Wallet request failed.',
    ...overrides,
  };
  const create = new Function(...Object.keys(dependencies), `${source}\nreturn createBrowserGatewayTransfer;`)(...Object.values(dependencies));
  const options = { network, getProvider: () => selected, getAddress: () => account, isActive: () => mounted, onUpdate: (record, message) => { events.push({ record, message }); } };
  const controller = create(options);
  return {
    controller, create, options, events, provider, records,
    select: (value) => { selected = value; }, account: (value) => { account = value; },
    close: () => { mounted = false; },
    pause: () => new Promise((resolve) => { waiting = resolve; }),
    resume: () => { waiting = null; resume(); },
    sends: () => events.filter((event) => event.method === 'eth_sendTransaction'),
  };
}

for (const network of ['eip155:5042', 'eip155:5042002']) {
  test(`${network}: selected provider, exact chain, receipt-gated deposit`, async () => {
    const h = harness({ network });
    assert.equal((await h.controller.run('deposit', '1')).status, 'confirmed');
    assert.equal(h.sends().length, 2);
    assert.ok(h.events.filter((event) => event.health).every((event) => event.chainId === Number(network.split(':')[1])));
    assert.equal(h.controller.saved().transferHash, deposit);
  });
}

test('an explicitly missing selected provider never sends', async () => {
  const h = harness();
  h.select(null);
  assert.equal(await h.controller.run('deposit', '1'), null);
  assert.equal(h.sends().length, 0);
});

test('wrong displayed account fails before send', async () => {
  const h = harness();
  h.provider.request = async () => [other];
  assert.equal(await h.controller.run('deposit', '1'), null);
  assert.equal(h.sends().length, 0);
});

test('RPC health failure stops before approval', async () => {
  const h = harness({ checkArcConnection: async () => { throw Error('offline'); } });
  assert.equal(await h.controller.run('deposit', '1'), null);
  assert.equal(h.sends().length, 0);
});

for (const change of ['provider', 'account', 'close', 'destroy']) {
  test(`${change} during approval prevents the deposit`, async () => {
    const h = harness();
    const paused = h.pause();
    const operation = h.controller.run('deposit', '1');
    await paused;
    if (change === 'provider') h.select({ request: () => { throw Error('wrong provider'); } });
    if (change === 'account') h.account(other);
    if (change === 'close') h.close();
    if (change === 'destroy') h.controller.destroy();
    h.resume();
    assert.equal(await operation, null);
    assert.equal(h.sends().length, 1);
  });
}

test('approval receipt timeout resumes the original approval without a repeat', async () => {
  const h = harness();
  const paused = h.pause();
  const operation = h.controller.run('deposit', '1');
  await paused;
  h.close(); h.resume();
  await operation;
  // A fresh controller can resume the same store once its panel is active.
  const restored = h.create({ ...h.options, isActive: () => true });
  assert.equal((await restored.run('deposit', '50')).amount, '1');
  assert.equal(h.sends().length, 2);
});

test('duplicate clicks are synchronously locked', async () => {
  const h = harness();
  const paused = h.pause();
  const operation = h.controller.run('deposit', '1');
  assert.equal(await h.controller.run('deposit', '1'), null);
  await paused; h.resume(); await operation;
  assert.equal(h.sends().length, 2);
});

test('explicit repair preserves a pending transfer and never resumes payment', async () => {
  let checks = 0;
  const h = harness({ checkArcConnection: async () => { if (++checks === 2) throw Error('offline'); } });
  await h.controller.run('deposit', '1');
  const before = structuredClone([...h.records]);
  assert.equal(await h.controller.repair(), true);
  assert.deepEqual([...h.records], before);
  assert.equal(h.sends().length, 1);
  assert.match(h.events.at(-1).message, /saved transaction is unchanged/);
});

test('unknown wallet-send outcome remains blocked after repair', async () => {
  const h = harness();
  const request = h.provider.request;
  let attempted = 0;
  h.provider.request = (args) => {
    if (args.method === 'eth_sendTransaction') { attempted++; throw Error('response lost'); }
    return request(args);
  };
  await h.controller.run('deposit', '1');
  const before = structuredClone([...h.records]);
  assert.equal(await h.controller.repair(), true);
  assert.deepEqual([...h.records], before);
  assert.equal(await h.controller.run('deposit', '1'), null);
  assert.equal(attempted, 1);
});

test('terminal reset rechecks the original receipt and does not pay', async () => {
  const h = harness();
  await h.controller.run('deposit', '1');
  assert.equal(await h.controller.reset(), true);
  assert.equal(h.controller.saved(), null);
  assert.equal(h.sends().length, 2);
});

test('unsupported network fails closed', () => {
  assert.throws(() => harness({ network: 'eip155:1' }), /Choose Arc/);
});

const uiSource = (await readFile(new URL('../packages/nibgate/src/browser/default-ui.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]+\n/gm, '').replaceAll('export function ', 'function ');

// Minimal deterministic DOM boundary; exercises real default-ui handlers.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.style = {}; this.listeners = new Map(); this.value = ''; this.textContent = ''; this.hidden = false; }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key]; }
  get dataset() { return Object.fromEntries(Object.entries(this.attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5), v])); }
  set innerHTML(value) {
    this.html = value; this.children = [];
    for (const match of value.matchAll(/<(\w+)([^>]*)>/g)) {
      const child = new Element(match[1]);
      for (const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) child.attrs[a[1]] = a[2] || '';
      if ('hidden' in child.attrs) child.hidden = true;
      this.appendChild(child);
    }
  }
  get innerHTML() { return this.html || this.textContent; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this); this.parent = null; }
  get isConnected() { return this.root === true || this.parent?.isConnected === true; }
  querySelectorAll(selector) {
    const key = selector.replace(/^\[|\]$/g, '');
    return this.children.flatMap((child) => [...(key in child.attrs ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(event, callback) { const list = this.listeners.get(event) || []; list.push(callback); this.listeners.set(event, list); }
  removeEventListener(event, callback) { this.listeners.set(event, (this.listeners.get(event) || []).filter((fn) => fn !== callback)); }
  async click() { if (!this.disabled) for (const fn of this.listeners.get('click') || []) await fn({ target: this }); }
}

function uiHarness(extra = {}) {
  const h = harness();
  const document = { createElement: (tag) => new Element(tag), getElementById: () => null, head: new Element('head') };
  const container = new Element('main'); container.root = true;
  const window = { ethereum: { request: () => { throw Error('Wrong global wallet'); } } };
  let refresh;
  const create = (options) => h.create(options);
  const render = new Function('document', 'window', 'createBrowserGatewayTransfer', 'getWalletErrorMessage', 'setTimeout', 'clearTimeout', 'fetch', `${uiSource}\nreturn renderDefaultGatewayWalletUI;`)(document, window, create, () => 'Wallet failed.', (fn) => { refresh = fn; return 1; }, () => {}, async () => ({ json: async () => ({ result: '0x0' }) }));
  const ui = render(container, { provider: h.provider, address, ...extra });
  return { h, ui, refresh: () => refresh(), query: (selector) => ui.element.querySelector(selector) };
}

test('actual default UI routes through explicit provider and displays confirmed hashes', async () => {
  const { h, ui, query, refresh } = uiHarness();
  await refresh();
  query('[data-gw-deposit-amount]').value = '1';
  await query('[data-gw-deposit]').click();
  assert.equal(h.sends().length, 2);
  assert.match(query('[data-gw-hashes]').textContent, new RegExp(deposit));
  assert.equal(query('[data-gw-deposit]').textContent, 'Start a new transfer');
  assert.equal(query('[data-gw-tx]').textContent, 'Deposited!');
  ui.destroy();
});

test('actual default UI repair is explicit and never starts a deposit', async () => {
  const { h, ui, query, refresh } = uiHarness();
  await refresh();
  await query('[data-gw-repair]').click();
  assert.equal(h.sends().length, 0);
  assert.match(query('[data-gw-tx]').textContent, /RPC is responding/);
  ui.destroy();
});

test('a saved deposit remains resumable while the UI was on its Withdraw tab', async () => {
  let displayed = address;
  const { h, ui, query, refresh } = uiHarness({ getAddress: () => displayed });
  await refresh();
  const withdrawTab = ui.element.querySelectorAll('[data-tab]').find((button) => button.dataset.tab === 'withdraw');
  await withdrawTab.click();
  displayed = other; h.account(other);
  const record = { chainId: 5042002, address: other, gateway: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9', usdc: '0x3600000000000000000000000000000000000000', kind: 'deposit', amount: '1', status: 'pending', submitting: null, approvalHash: null, transferHash: null };
  h.records.set(engine.gatewayTransferKey(record), record);
  await refresh();
  assert.equal(query('[data-gw-withdraw]').textContent, 'Resume deposit');
  await query('[data-gw-withdraw]').click();
  assert.equal(h.sends().length, 2);
  assert.equal(query('[data-gw-tx]').textContent, 'Deposited!');
  ui.destroy();
});

test('destroying the actual default UI during approval prevents deposit', async () => {
  const { h, ui, query, refresh } = uiHarness();
  await refresh();
  query('[data-gw-deposit-amount]').value = '1';
  const paused = h.pause();
  const operation = query('[data-gw-deposit]').click();
  await paused;
  ui.destroy(); h.resume();
  await operation;
  assert.equal(h.sends().length, 1);
});

test('selected-wallet guard reaches both network and pre-send health helpers', async () => {
  let h;
  const seen = [];
  h = harness({
    ensureArcNetwork: async (_p, { chain: target, assertActive }) => { assert.equal(target.id, 5042002); assertActive(); seen.push('ensure'); },
    checkArcConnection: async (_p, { assertActive }) => { h.select(null); assert.throws(assertActive, /changed/); throw Error('changed'); },
  });
  assert.equal(await h.controller.run('deposit', '1'), null);
  assert.deepEqual(seen, ['ensure']);
  assert.equal(h.sends().length, 0);
});

test('external account change requires a displayed-address refresh before sending', async () => {
  let displayed = address;
  const { h, ui, query, refresh } = uiHarness({ getAddress: () => displayed });
  await refresh();
  query('[data-gw-deposit-amount]').value = '1';
  displayed = other; h.account(other);
  await query('[data-gw-deposit]').click();
  assert.equal(h.sends().length, 0);
  assert.match(query('[data-gw-tx]').textContent, /Review the displayed account/);
  assert.equal(query('[data-gw-wallet-addr]').textContent, '0x2222...2222');
  await query('[data-gw-deposit]').click();
  assert.equal(h.sends().length, 2);
  assert.equal(h.sends()[0].params[0].from, other);
  ui.destroy();
});

test('default unlock UI exposes only explicit retryVerification for submitted proof', async () => {
  assert.match(uiSource, /data-nibgate-retry-payment/);
  assert.match(uiSource, /await ctrl\.retryVerification\(\)/);
  assert.match(uiSource, /if \(pending\) \{ btn\.disabled = true;/);
  assert.match(uiSource, /ctrl\.destroy\?\.\(\)/);
});

test('default unlock UI explicit repair does not call unlock or retry', async () => {
  assert.match(uiSource, /data-nibgate-repair-wallet/);
  assert.match(uiSource, /await ctrl\.repairConnection\(\)/);
  assert.match(uiSource, /Saved Gateway payment data needs review before paying again/);
});

test('default unlock UI permits cancelling only an unsigned, unsubmitted reservation', () => {
  assert.match(uiSource, /data-nibgate-cancel-approval/);
  assert.match(uiSource, /cancelApproval\.hidden = !pending \|\| pending\.canRetry \|\| pending\.submitted/);
  assert.match(uiSource, /try \{ ctrl\.clear\(\); \}/);
  assert.match(uiSource, /Approval unfinished/);
});
