// Build current SDK + wallet source entirely offline using existing dependencies.
// This source-integration check does not replace a fresh package-install build.
// Optional environment overrides for an incomplete workspace:
// NIBGATE_TEST_ESBUILD_MODULE=/existing/path/esbuild/lib/main.js
// NIBGATE_TEST_NODE_MODULES=/existing/path/node_modules
// ESBUILD_BINARY_PATH=/existing/path/esbuild
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../packages/nibgate/package.json', import.meta.url));
const esbuildPath = process.env.NIBGATE_TEST_ESBUILD_MODULE || require.resolve('esbuild');
const { build } = await import(pathToFileURL(esbuildPath).href);
const nodePaths = (process.env.NIBGATE_TEST_NODE_MODULES || '').split(path.delimiter).filter(Boolean);
for (const minify of [false, true]) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['packages/nibgate/src/browser/index.js'],
    bundle: true, format: 'iife', globalName: 'Nibgate', target: 'es2020',
    platform: 'browser', metafile: true, write: false, minify, nodePaths,
    plugins: [{
      name: 'current-local-wallet-source',
      setup(build) {
        build.onResolve({ filter: /^@nibgate\/wallet$/ }, () => ({ path: path.join(root, 'packages/wallet/src/index.js') }));
        build.onResolve({ filter: /^crypto$/ }, ({ importer }) => {
          if (importer.replaceAll('\\', '/').includes('/@circle-fin/x402-batching/dist/client/')) {
            return { path: 'crypto', external: true, sideEffects: false };
          }
        });
      },
    }],
  });
  assert.deepEqual(Object.values(result.metafile.outputs).flatMap((out) => out.imports).filter((item) => item.external), []);
  const context = createContext({
    crypto: webcrypto, TextEncoder, TextDecoder, URL, URLSearchParams,
    atob, btoa, setTimeout, clearTimeout,
    fetch() { throw Error('Unexpected network call in offline bundle check'); },
  });
  runInContext('window=globalThis', context);
  runInContext(result.outputFiles[0].text, context);
  for (const name of ['require', 'process', 'Buffer']) assert.equal(runInContext(`typeof ${name}`, context), 'undefined');
  assert.equal(typeof context.Nibgate.renderDefaultGatewayWalletUI, 'function');
  assert.equal(typeof context.Nibgate.createEvmGatewayUnlock, 'function');
  for (const network of ['eip155:5042', 'eip155:5042002']) {
    let signatures = 0;
    const adapter = await context.Nibgate.createCircleGatewayBrowserAdapter({
      network,
      signer: { address: `0x${'1'.repeat(40)}`, signTypedData: async () => { signatures++; return `0x${'11'.repeat(65)}`; } },
    });
    const challenge = { x402Version: 2, resource: { url: 'https://example.test/article' }, accepts: [{
      scheme: 'exact', network, amount: '10000', asset: '0x3600000000000000000000000000000000000000',
      payTo: `0x${'2'.repeat(40)}`, maxTimeoutSeconds: 300,
      extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: `0x${'3'.repeat(40)}` },
    }] };
    const paid = await adapter.pay({ challenge });
    assert.equal(signatures, 1);
    assert.equal(JSON.parse(atob(paid.paymentSignature)).accepted.network, network);
    challenge.accepts[0].network = network === 'eip155:5042' ? 'eip155:5042002' : 'eip155:5042';
    await assert.rejects(adapter.pay({ challenge }), /No Circle Gateway/);
    assert.equal(signatures, 1, 'mismatched network must not sign');
  }
  console.log(`${minify ? 'Minified' : 'Readable'} current-source CDN: no external imports, no Node globals, both-network proofs and cross-network rejection PASS`);
}
console.log('Uses explicit local wallet alias and existing dependencies; clean release-package installation remains a separate gate.');
