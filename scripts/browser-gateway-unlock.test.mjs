// Dependency-free offline execution of the production controller, adapter, and
// RPC guard. Only external Circle/viem packages and browser/HTTP IO are stubbed.
// Run with Node 22: node --test scripts/browser-gateway-unlock.test.mjs
import assert from 'node:assert/strict';
import { readFile } from './test-source.mjs';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const stripImports = (source) => source.replace(/^import .*;\n/gm, '');
const stripExports = (source) => source.replace(/^export /gm, '');
const chainSource = stripExports(stripImports(await read('../packages/wallet/src/chain.js')));
const chains = new Function('defineChain', `${chainSource}\nreturn { ARC_TESTNET, ARC_MAINNET, activeChain, getAddArcNetworkParams };`)((chain) => chain);
const networkSource = stripExports(stripImports(await read('../packages/wallet/src/network.js')));
const network = new Function(...Object.keys(chains), `${networkSource}\nreturn { ensureArcNetwork, checkArcConnection, repairArcNetwork };`)(...Object.values(chains));
const controllerSource = stripExports(stripImports(await read('../packages/nibgate/src/browser/evm-gateway.js')))
  .replace("import('./gateway.js')", 'loadGateway()')
  .replace("import('viem')", 'loadViem()');
const adapterSource = stripExports(stripImports(await read('../packages/nibgate/src/browser/gateway.js')));
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const resource = { id: 'offline-resource', title: 'Offline', price: '0.1', currency: 'USDC', recipient: B };
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function storage() {
  const values = new Map();
  return { values, getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
function wallet({ address = A, chain = 5042002, hook } = {}) {
  const listeners = new Map();
  const calls = [];
  const provider = {
    address, chain, calls, hook,
    on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
    removeListener(event, listener) { listeners.get(event)?.delete(listener); },
    emit(event, payload) { for (const listener of listeners.get(event) || []) listener(payload); },
    listenerCount() { return [...listeners.values()].reduce((sum, group) => sum + group.size, 0); },
    async request(request) {
      calls.push(request);
      const override = await provider.hook?.(request, provider);
      if (override !== undefined) return override;
      if (request.method === 'eth_accounts' || request.method === 'eth_requestAccounts') return provider.address ? [provider.address] : [];
      if (request.method === 'eth_chainId') return `0x${provider.chain.toString(16)}`;
      if (request.method === 'eth_blockNumber') return '0x123';
      if (request.method === 'wallet_switchEthereumChain') {
        provider.chain = Number(request.params[0].chainId);
        provider.emit('chainChanged', request.params[0].chainId);
        return null;
      }
      if (request.method === 'eth_signTypedData_v4') return '0xoffline-signature';
      if (request.method === 'wallet_revokePermissions' || request.method === 'wallet_addEthereumChain') return null;
      throw Error(`Unexpected request: ${request.method}`);
    }
  };
  return provider;
}
const requirement = (network = 'eip155:5042002') => ({ scheme: 'exact', network, asset: B, payTo: B, amount: '100000', extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: B } });
function harness(settings = {}) {
  const selected = settings.provider || wallet();
  const injected = settings.injected || wallet();
  const sessionStorage = settings.sessionStorage || storage();
  const win = { ethereum: injected, sessionStorage, document: { querySelector: () => null } };
  const stats = { signed: [], requests: [], marks: [], statuses: [], unlocked: [], proofs: [], nonce: 0 };
  class Scheme {
    constructor(signer) { this.signer = signer; }
    async createPaymentPayload(version, accepted) {
      const typedData = { domain: { chainId: settings.domainChain ?? Number(accepted.network.split(':')[1]), name: 'GatewayWalletBatched', version: '1', verifyingContract: B }, types: {}, primaryType: 'BurnIntent', message: { nonce: ++stats.nonce } };
      const signature = await this.signer.signTypedData(typedData);
      return { x402Version: version, payload: { signature, typedData } };
    }
  }
  const createAdapter = new Function('CircleBatchEvmScheme', 'stringifyJson', `${adapterSource}\nreturn createCircleGatewayBrowserAdapter;`)(Scheme, JSON.stringify);
  const challenge = { x402Version: 2, accepts: settings.accepts || [requirement(settings.network)], resource: { url: 'https://creator.example/offline-resource' } };
  const values = {
    ...chains, ...network, browserWindow: () => win, stringifyJson: JSON.stringify,
    getPaymentProof: () => '', storePaymentProof: (_resource, proof) => stats.proofs.push(proof), clearPaymentProof: () => true,
    createGate: (resource) => ({ resource, unlockStarted() {}, markUnlocked: (payment) => stats.marks.push(payment) }),
    trackResourcePage() {}, isWalletRejection: (error) => error?.code === 4001, getWalletErrorMessage: (error) => error?.message || 'Wallet request failed.',
    loadGateway: async () => ({ createCircleGatewayBrowserAdapter: createAdapter }),
    loadViem: async () => ({ custom: (provider) => provider, createWalletClient: ({ transport }) => ({
      signTypedData: async (typedData) => { stats.signed.push({ provider: transport, typedData }); return transport.request({ method: 'eth_signTypedData_v4', params: [typedData.account, typedData] }); }
    }) }),
    fetch: async (path, options) => {
      stats.requests.push({ path, ...options });
      const override = await settings.fetch?.(path, options, stats);
      if (override !== undefined) return override;
      if (!options.headers['payment-signature']) return new Response(JSON.stringify(challenge), { status: 402, headers: { 'payment-required': Buffer.from(JSON.stringify(challenge)).toString('base64') } });
      return new Response(JSON.stringify({ ok: true, unlockProof: 'offline-unlock' }), { status: 200 });
    }
  };
  const createController = new Function(...Object.keys(values), `${controllerSource}\nreturn createEvmGatewayUnlock;`)(...Object.values(values));
  const options = { provider: selected, autoMount: false, network: settings.network || 'eip155:5042002', onStatus: (status) => stats.statuses.push(status), onUnlock: (result) => stats.unlocked.push(result), ...settings.options };
  const controller = createController(resource, options);
  return { controller, createController, createAdapter, provider: selected, injected, stats, sessionStorage, options };
}
function submitted(stats) { return stats.requests.filter((request) => request.headers['payment-signature']); }

test('explicit EIP-1193 provider wins over injected wallet, including health and signing', async () => {
  const h = harness();
  assert.equal(h.controller.getProvider(), h.provider);
  assert.equal((await h.controller.unlock()).ok, true);
  assert.equal(h.stats.signed[0].provider, h.provider);
  assert.ok(h.provider.calls.some(({ method }) => method === 'eth_blockNumber'));
  assert.equal(h.injected.calls.length, 0);
});
for (const options of [{ provider: null }, { provider: undefined }, { getProvider: () => null }, { getProvider: () => undefined }]) {
  test(`explicit unavailable provider never falls back: ${Object.keys(options)[0]} ${options.provider}`, async () => {
    const h = harness({ options });
    assert.equal(h.controller.getProvider(), null);
    assert.equal((await h.controller.unlock()).ok, false);
    assert.equal(h.injected.calls.length, 0);
    assert.equal(h.stats.signed.length, 0);
  });
}
test('unconfigured provider uses the injected wallet', async () => {
  const h = harness();
  const { provider: _unused, ...options } = h.options;
  const controller = h.createController(resource, options);
  assert.equal(controller.getProvider(), h.injected);
  assert.equal((await controller.unlock()).ok, true);
});
test('dynamic provider selection change during RPC health stops before signing', async () => {
  const first = wallet(), second = wallet();
  let selected = first;
  first.hook = ({ method }) => { if (method === 'eth_blockNumber') selected = second; };
  const h = harness({ options: { getProvider: () => selected } });
  assert.equal((await h.controller.unlock()).ok, false);
  assert.equal(h.stats.signed.length, 0);
  assert.equal(submitted(h.stats).length, 0);
  assert.equal(h.controller.getProvider(), second);
});
test('correct cached Arc chain still fails closed on wallet RPC HTTP 404', async () => {
  const provider = wallet({ hook: ({ method }) => { if (method === 'eth_blockNumber') throw { status: 404 }; } });
  const h = harness({ provider });
  const result = await h.controller.unlock();
  assert.equal(result.ok, false);
  assert.match(result.error, /404/);
  assert.equal(h.stats.signed.length, 0);
});
for (const [network, initial, expected] of [['eip155:5042', 5042002, 5042], ['eip155:5042002', 5042, 5042002]]) {
  test(`exact ${network} selection switches away from the other Arc network`, async () => {
    const provider = wallet({ chain: initial });
    const h = harness({ provider, network });
    assert.equal((await h.controller.unlock()).ok, true);
    assert.equal(provider.chain, expected);
    assert.equal(h.stats.signed[0].typedData.domain.chainId, expected);
    assert.equal(provider.calls.filter(({ method }) => method === 'wallet_switchEthereumChain').length, 1);
  });
}
test('unknown configured network rejects before any wallet IO', () => {
  assert.throws(() => harness({ network: 'eip155:1' }), /Arc Mainnet or Arc Testnet/);
});
test('wrong-network Gateway requirement fails rather than selecting a fallback', async () => {
  const h = harness({ accepts: [requirement('eip155:5042')] });
  const result = await h.controller.unlock();
  assert.equal(result.ok, false);
  assert.match(result.error, /No Circle Gateway batching payment option found/);
  assert.equal(h.stats.signed.length, 0);
  assert.equal(h.controller.getPendingPayment(), null);
});
test('adapter chooses only the exact configured requirement', async () => {
  const h = harness({ accepts: [requirement('eip155:5042'), requirement()] });
  assert.equal((await h.controller.unlock()).ok, true);
  assert.equal(JSON.parse(Buffer.from(submitted(h.stats)[0].headers['payment-signature'], 'base64')).accepted.network, 'eip155:5042002');
});
test('mismatched typed-data domain is rejected before opening signature prompt', async () => {
  const h = harness({ domainChain: 5042 });
  assert.equal((await h.controller.unlock()).ok, false);
  assert.equal(h.stats.signed.length, 0);
  assert.equal(submitted(h.stats).length, 0);
});
for (const event of ['account', 'provider', 'chain', 'disconnect', 'clear', 'destroy']) {
  test(`${event} change while signature is pending prevents proof submission and stale unlock`, async () => {
    const sign = deferred();
    const first = wallet({ hook: ({ method }) => method === 'eth_signTypedData_v4' ? sign.promise : undefined });
    let selected = first;
    const h = harness({ options: { getProvider: () => selected } });
    const run = h.controller.unlock();
    while (!h.stats.signed.length) await nextTurn();
    if (event === 'account') { first.address = B; first.emit('accountsChanged', [B]); }
    if (event === 'provider') selected = wallet();
    if (event === 'chain') { first.chain = 5042; first.emit('chainChanged', '0x13b2'); }
    if (event === 'disconnect') await h.controller.disconnect();
    if (event === 'clear') h.controller.clear();
    if (event === 'destroy') h.controller.destroy();
    sign.resolve('0xoffline-signature');
    assert.equal((await run).ok, false);
    assert.equal(submitted(h.stats).length, 0);
    assert.equal(h.stats.unlocked.length, 0);
    if (event === 'destroy') assert.equal(first.listenerCount(), 0);
  });
}
test('account change without provider events is re-read before signature', async () => {
  const provider = wallet({ hook: ({ method }, p) => { if (method === 'eth_blockNumber') p.address = B; } });
  const h = harness({ provider });
  assert.equal((await h.controller.unlock()).ok, false);
  assert.equal(h.stats.signed.length, 0);
});
test('network change without provider events during signature is not submitted', async () => {
  const provider = wallet({ hook: ({ method }, p) => { if (method === 'eth_signTypedData_v4') p.chain = 5042; } });
  const h = harness({ provider });
  assert.equal((await h.controller.unlock()).ok, false);
  assert.equal(submitted(h.stats).length, 0);
});
test('concurrent unlock calls share one approval and submission', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.controller.unlock(), h.controller.unlock()]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(h.stats.signed.length, 1);
  assert.equal(submitted(h.stats).length, 1);
});
test('lost verification response retains exact proof, blocks new payment, and retries only explicitly', async () => {
  let lost = true;
  const h = harness({ fetch: (_path, options) => { if (options.headers['payment-signature'] && lost) { lost = false; throw Error('Response lost'); } } });
  assert.equal((await h.controller.unlock()).ok, false);
  assert.deepEqual(h.controller.getPendingPayment(), { address: A, network: 'eip155:5042002', submitted: true, canRetry: true });
  assert.equal((await h.controller.unlock()).ok, false);
  assert.equal(h.stats.signed.length, 1);
  assert.equal(submitted(h.stats).length, 1);
  assert.equal((await h.controller.retryVerification()).ok, true);
  assert.equal(h.stats.signed.length, 1);
  assert.equal(submitted(h.stats).length, 2);
  assert.equal(submitted(h.stats)[0].headers['payment-signature'], submitted(h.stats)[1].headers['payment-signature']);
  assert.equal(h.controller.getPendingPayment(), null);
});
test('clear/destroy/remount preserve a submitted authorization and prevent signing again', async () => {
  const h = harness({ fetch: (_path, options) => { if (options.headers['payment-signature']) throw Error('Lost response'); } });
  await h.controller.unlock();
  h.controller.clear();
  assert.equal(h.controller.getPendingPayment().submitted, true);
  h.controller.destroy();
  const resumed = harness({ sessionStorage: h.sessionStorage });
  assert.equal((await resumed.controller.unlock()).ok, false);
  assert.equal(resumed.stats.signed.length, 0);
  assert.equal((await resumed.controller.retryVerification()).ok, true);
  assert.equal(submitted(resumed.stats)[0].headers['payment-signature'], submitted(h.stats)[0].headers['payment-signature']);
});
test('pending proof cannot be verified from a different account or network', async () => {
  const h = harness({ fetch: (_path, options) => { if (options.headers['payment-signature']) throw Error('Lost response'); } });
  await h.controller.unlock();
  h.provider.address = B;
  h.provider.emit('accountsChanged', [B]);
  assert.equal((await h.controller.retryVerification()).ok, false);
  assert.equal(submitted(h.stats).length, 1);
  const wrongNetwork = harness({ sessionStorage: h.sessionStorage, network: 'eip155:5042' });
  assert.equal((await wrongNetwork.controller.retryVerification()).ok, false);
  assert.equal(wrongNetwork.stats.requests.length, 0);
});
test('rejected signing never submits and only a new explicit unlock requests another approval', async () => {
  const provider = wallet({ hook: ({ method }) => { if (method === 'eth_signTypedData_v4') throw { code: 4001 }; } });
  const h = harness({ provider });
  assert.match((await h.controller.unlock()).error, /cancelled/);
  assert.equal(h.controller.getPendingPayment(), null);
  assert.equal(submitted(h.stats).length, 0);
  assert.equal(h.stats.signed.length, 1);
  provider.hook = null;
  assert.equal((await h.controller.unlock()).ok, true);
  assert.equal(h.stats.signed.length, 2);
});
test('clear during verification keeps pending proof and never marks stale success', async () => {
  const response = deferred();
  const h = harness({ fetch: (_path, options) => options.headers['payment-signature'] ? response.promise : undefined });
  const run = h.controller.unlock();
  while (!submitted(h.stats).length) await nextTurn();
  h.controller.clear();
  response.resolve(new Response(JSON.stringify({ ok: true, unlockProof: 'stale' }), { status: 200 }));
  assert.equal((await run).ok, false);
  assert.equal(h.stats.marks.length, 0);
  assert.equal(h.stats.proofs.length, 0);
  assert.equal(h.controller.getPendingPayment().submitted, true);
});
test('unavailable recovery storage stops before signing', async () => {
  const sessionStorage = { getItem: () => null, setItem: () => { throw Error('disabled'); } };
  const h = harness({ sessionStorage });
  assert.equal((await h.controller.unlock()).ok, false);
  assert.equal(h.stats.signed.length, 0);
});
test('another mounted controller cannot request a second payment while approval is pending', async () => {
  const sign = deferred();
  const provider = wallet({ hook: ({ method }) => method === 'eth_signTypedData_v4' ? sign.promise : undefined });
  const h = harness({ provider });
  const run = h.controller.unlock();
  while (!h.stats.signed.length) await nextTurn();
  const other = harness({ sessionStorage: h.sessionStorage });
  assert.equal((await other.controller.unlock()).ok, false);
  assert.equal(other.stats.signed.length, 0);
  sign.resolve('0xoffline-signature');
  assert.equal((await run).ok, true);
});

test('another controller refreshes same-ID reservation into a submitted proof and cannot clear it', async () => {
  const signature = deferred(), settlement = deferred();
  const provider = wallet({ hook: ({ method }) => method === 'eth_signTypedData_v4' ? signature.promise : undefined });
  const first = harness({ provider, fetch: (_path, options) => options.headers['payment-signature'] ? settlement.promise : undefined });
  const run = first.controller.unlock();
  while (!first.stats.signed.length) await nextTurn();
  const second = harness({ sessionStorage: first.sessionStorage });
  assert.equal(second.controller.getPendingPayment().canRetry, false);
  signature.resolve('0xoffline-signature');
  while (!submitted(first.stats).length) await nextTurn();
  second.controller.clear();
  assert.equal(second.controller.getPendingPayment().submitted, true);
  assert.equal(second.controller.getPendingPayment().canRetry, true);
  assert.equal((await second.controller.unlock()).ok, false);
  assert.equal(second.stats.signed.length, 0);
  settlement.resolve(new Response(JSON.stringify({ ok: true, unlockProof: 'settled' }), { status: 200 }));
  assert.equal((await run).ok, true);
  assert.equal(second.controller.getPendingPayment(), null);
});
for (const body of ['', '<html>OK</html>', 'null', '[]', '"OK"', '{}']) {
  test(`invalid successful settlement response retains authorization: ${JSON.stringify(body)}`, async () => {
    const h = harness({ fetch: (_path, options) => options.headers['payment-signature'] ? new Response(body, { status: 200 }) : undefined });
    assert.equal((await h.controller.unlock()).ok, false);
    assert.equal(h.controller.getPendingPayment().submitted, true);
    assert.equal(h.stats.marks.length, 0);
    assert.equal((await h.controller.unlock()).ok, false);
    assert.equal(h.stats.signed.length, 1);
  });
}
test('self-content unlock avoids a payment signature using the resource recipient', async () => {
  const h = harness({ provider: wallet({ address: B }) });
  const result = await h.controller.unlock();
  assert.equal(result.ok, true);
  assert.equal(result.self, true);
  assert.equal(h.stats.signed.length, 0);
});
test('disconnect during account connection invalidates the pending unlock', async () => {
  const connected = deferred();
  const provider = wallet({ address: '', hook: ({ method }, p) => method === 'eth_requestAccounts' ? connected.promise.then(() => { p.address = A; return [A]; }) : undefined });
  const h = harness({ provider });
  const run = h.controller.unlock();
  while (!provider.calls.some(({ method }) => method === 'eth_requestAccounts')) await nextTurn();
  await h.controller.disconnect();
  connected.resolve();
  assert.equal((await run).ok, false);
  assert.equal(h.stats.signed.length, 0);
});

test('explicit repair uses selected trusted chain, verifies health, and never signs or submits', async () => {
  const h = harness({ network: 'eip155:5042', provider: wallet({ chain: 5042 }) });
  const result = await h.controller.repairConnection();
  assert.equal(result.chainId, 5042);
  assert.equal(result.requestedRpcUrl, 'https://rpc.mainnet.arc.io');
  assert.equal(h.injected.calls.length, 0);
  assert.equal(h.provider.calls.find(({ method }) => method === 'wallet_addEthereumChain').params[0].rpcUrls[0], 'https://rpc.mainnet.arc.io');
  assert.equal(h.stats.signed.length, 0);
  assert.equal(h.stats.requests.length, 0);
});
test('repair retains a submitted proof without silently retrying it', async () => {
  const h = harness({ fetch: (_path, options) => { if (options.headers['payment-signature']) throw Error('Lost response'); } });
  await h.controller.unlock();
  const before = h.controller.getPendingPayment();
  await h.controller.repairConnection();
  assert.deepEqual(h.controller.getPendingPayment(), before);
  assert.equal(h.stats.signed.length, 1);
  assert.equal(submitted(h.stats).length, 1);
});
test('account switch during explicit repair prevents the subsequent chain switch and signing', async () => {
  const provider = wallet({ hook: ({ method }, p) => { if (method === 'wallet_addEthereumChain') { p.address = B; p.emit('accountsChanged', [B]); } } });
  const h = harness({ provider });
  await assert.rejects(h.controller.repairConnection(), { reason: 'changed' });
  assert.equal(provider.calls.filter(({ method }) => method === 'wallet_switchEthereumChain').length, 0);
  assert.equal(h.stats.signed.length, 0);
});

for (const saved of ['', 'false', '0', 'null', '[]', '{}', '"approval"', '{broken', JSON.stringify({ id: 'x', network: 5042002, address: A }), JSON.stringify({ id: 'x', network: 'eip155:5042002', address: A, paymentSignature: false })]) {
  test(`malformed recovery data blocks signing: ${JSON.stringify(saved)}`, async () => {
    const h = harness();
    h.sessionStorage.setItem(`nibgate:gateway-pending:${JSON.stringify(['/api/nibgate/access', 'GET', 'offline-resource'])}`, saved);
    const result = await h.controller.unlock();
    assert.equal(result.ok, false);
    assert.match(result.error, /unreadable recovery data/);
    assert.equal(h.stats.signed.length, 0);
    assert.equal(h.stats.requests.length, 0);
  });
}

for (const [options, expected] of [
  [{ hosted: true, network: undefined }, 'https://testnet-api.nibgate.xyz/hub/pay'],
  [{ hosted: true, network: 'eip155:5042002' }, 'https://testnet-api.nibgate.xyz/hub/pay'],
  [{ hosted: true, network: 'eip155:5042' }, 'https://api.nibgate.xyz/hub/pay'],
  [{ accessPath: 'hosted', network: 'eip155:5042' }, 'https://api.nibgate.xyz/hub/pay'],
  [{ hosted: true, accessPath: 'https://creator.example/custom-access' }, 'https://creator.example/custom-access'],
]) {
  test(`hosted access uses selected network or explicit endpoint: ${JSON.stringify(options)}`, async () => {
    const h = harness({ options, network: options.network || 'eip155:5042002' });
    assert.equal((await h.controller.unlock()).ok, true);
    assert.ok(h.stats.requests.every(({ path }) => path === expected));
  });
}
test('clear can cancel an unsigned abandoned reservation but cannot discard a saved signature', () => {
  const h = harness();
  const key = `nibgate:gateway-pending:${JSON.stringify(['/api/nibgate/access', 'GET', 'offline-resource'])}`;
  h.sessionStorage.setItem(key, JSON.stringify({ id: 'unsigned', network: 'eip155:5042002', address: A, submitted: false }));
  h.controller.clear();
  assert.equal(h.controller.getPendingPayment(), null);
  h.sessionStorage.setItem(key, JSON.stringify({ id: 'signed', network: 'eip155:5042002', address: A, paymentSignature: 'saved-proof', submitted: false }));
  h.controller.clear();
  assert.equal(h.controller.getPendingPayment().canRetry, true);
  assert.equal(h.controller.getPendingPayment().submitted, false);
});

for (const extra of [{ submitted: true }, { submitted: true, paymentSignature: '' }, {}, { submitted: 'false' }, { submitted: 0 }]) {
  test(`inconsistent submission recovery state cannot be cleared or bypassed: ${JSON.stringify(extra)}`, async () => {
    const h = harness();
    const key = `nibgate:gateway-pending:${JSON.stringify(['/api/nibgate/access', 'GET', 'offline-resource'])}`;
    const saved = JSON.stringify({ id: 'possibly-submitted', network: 'eip155:5042002', address: A, ...extra });
    h.sessionStorage.setItem(key, saved);
    assert.throws(() => h.controller.clear(), /unreadable recovery data/);
    assert.equal(h.sessionStorage.getItem(key), saved);
    assert.equal((await h.controller.unlock()).ok, false);
    assert.equal(h.sessionStorage.getItem(key), saved);
    assert.equal(h.stats.signed.length, 0);
    assert.equal(h.stats.requests.length, 0);
  });
}
