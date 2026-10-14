// No live wallets, RPC calls, or signed transactions: exercise the installed
// Reown routing code while replacing only the iframe message boundary.
import assert from 'node:assert/strict';
import { readFile } from './test-source.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { arcAppKitRpcUrls } from '../packages/wallet/src/react/appkit-networks.js';
import {
  ARC_MAINNET, ARC_TESTNET, arcMainnet, arcTestnet,
  activeArcChain, appRpcUrlFor, getAddArcNetworkParams,
} from '../packages/wallet/src/chain.js';

// Resolve Reown's own dependencies through the installed peer adapter so this
// test also works with pnpm's strict dependency layout, without new deps.
const walletRequire = createRequire(new URL('../packages/wallet/package.json', import.meta.url));
const reownRequire = createRequire(walletRequire.resolve('@reown/appkit-adapter-wagmi'));
const { CaipNetworksUtil } = await import(pathToFileURL(reownRequire.resolve('@reown/appkit-utils')).href);
const { W3mFrameProvider } = await import(pathToFileURL(reownRequire.resolve('@reown/appkit-wallet')).href);

const cases = [
  ['testnet', ARC_TESTNET, arcTestnet, 'https://rpc.testnet.arc.io'],
  ['mainnet', ARC_MAINNET, arcMainnet, 'https://rpc.mainnet.arc.io'],
];
for (const [name, config, chain, rpcUrl] of cases) {
  test(`${name}: wallet and add-chain metadata use a broadcast-capable public RPC`, () => {
    assert.equal(chain.id, config.id);
    assert.deepEqual(chain.rpcUrls.default.http, [rpcUrl]);
    assert.deepEqual(getAddArcNetworkParams(config).rpcUrls, [rpcUrl]);
    assert.deepEqual(chain.nativeCurrency, { decimals: 18, name: 'USDC', symbol: 'USDC' });
  });

  test(`${name}: installed Reown forwards CSP-compatible RPC for embedded-wallet sends`, async () => {
    const customRpcUrls = arcAppKitRpcUrls([chain], 'offline-routing-test');
    const network = CaipNetworksUtil.extendCaipNetwork(chain, { projectId: 'offline-routing-test', customRpcUrls });
    const messages = [];
    const hash = `0x${'ab'.repeat(32)}`;
    const provider = {
      getActiveCaipNetwork: () => network,
      getCaipNetworks: () => [network],
      getRpcUrl: W3mFrameProvider.prototype.getRpcUrl,
      appEvent: async (event) => { messages.push(event); return hash; },
    };
    const result = await W3mFrameProvider.prototype.request.call(provider, {
      method: 'eth_sendTransaction',
      params: [{ from: `0x${'1'.repeat(40)}`, to: `0x${'2'.repeat(40)}`, value: '0x0' }],
    });
    assert.equal(result, hash);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].payload.chainId, config.id);
    const endpoint = new URL(messages[0].payload.rpcUrl);
    assert.equal(endpoint.origin, 'https://rpc.walletconnect.org');
    assert.equal(endpoint.searchParams.get('chainId'), `eip155:${config.id}`);
    assert.equal(endpoint.searchParams.get('projectId'), 'offline-routing-test');
    assert.equal(messages[0].payload.method, 'eth_sendTransaction');
  });
}

test('Arc AppKit overrides leave unrelated custom chains alone', () => {
  assert.deepEqual(arcAppKitRpcUrls([{ id: 1 }], 'test'), {});
});

test('per-build app RPC overrides remain separate from both exported wallet chains', () => {
  const keys = ['NEXT_PUBLIC_API_URL', 'NIBGATE_PUBLIC_API_URL', 'PUBLIC_API_URL', 'NEXT_PUBLIC_NIBGATE_NETWORK', 'NIBGATE_NETWORK'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    for (const [name, config, chain, rpcUrl] of cases) {
      process.env.NEXT_PUBLIC_NIBGATE_NETWORK = name;
      assert.equal(activeArcChain().id, config.id);
      assert.equal(appRpcUrlFor(), config.appRpcUrl);
      process.env.NEXT_PUBLIC_API_URL = 'https://custom-app.example///';
      assert.equal(appRpcUrlFor(), 'https://custom-app.example/rpc');
      assert.deepEqual(chain.rpcUrls.default.http, [rpcUrl]);
      delete process.env.NEXT_PUBLIC_API_URL;
    }
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('app-owned reads keep explicit proxy transports', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
  const appkit = await read('../packages/wallet/src/react/appkit.js');
  const rating = await read('../packages/wallet/src/react/rating.jsx');
  const walletButton = await read('../frontend/src/components/WalletButton.tsx');
  assert.match(appkit, /NIBGATE_RPC_URL\s*=\s*appRpcUrlFor\(\)/);
  assert.match(appkit, /transports\s*=\s*Object\.fromEntries\(chains\.map\(\(chain\)\s*=>\s*\[chain\.id,\s*http\(rpcUrl\)\]\)\)/);
  assert.match(rating, /transport:\s*http\(appRpcUrlFor\(\)\)/);
  assert.match(walletButton, /transport:\s*http\(appRpcUrlFor\(\)\)/);
  assert.doesNotMatch(walletButton, /http\(activeArcChain\(\)\.rpcUrls/);
});

test('application proxy remains read-only', async () => {
  const source = await readFile(new URL('../backend/src/server/routes/rpc-route.js', import.meta.url), 'utf8');
  const allowlist = source.match(/const ALLOWED_METHODS = new Set\(\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(allowlist, 'RPC method allowlist exists');
  assert.match(allowlist, /'eth_call'/);
  assert.match(allowlist, /'eth_estimateGas'/);
  assert.doesNotMatch(allowlist, /eth_sendRawTransaction|eth_sendTransaction/);
});
