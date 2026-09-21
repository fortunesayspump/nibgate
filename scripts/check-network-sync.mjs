// Guards the multi-network setup against drift.
//
// Chain parameters live in several places by necessity (the published wallet
// package cannot import the private internal package, subblogs ships registry
// builds, ops scripts must run standalone). This script asserts they all agree
// on both networks. Run: `node scripts/check-network-sync.mjs`
// (also `pnpm networks:check`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(path.join(rootDir, 'package.json'));
function requireFromRoot(rel) {
  return require(path.join(rootDir, rel));
}

const { NETWORKS } = await import('../packages/internal/src/networks.js');
const wallet = await import('../packages/wallet/src/chain.js');
const ops = await import('./network.mjs');
const subblogsBackend = requireFromRoot('subblogs/backend/src/lib/network.js');
const mainnetDeploy = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'contracts/deployments/arc-mainnet.json'), 'utf8')
);

const FRONTEND_NET = fs.readFileSync(
  path.join(rootDir, 'subblogs/frontend/src/lib/network.ts'), 'utf8'
);
function frontendHas(str, label, failures) {
  if (!FRONTEND_NET.includes(str)) failures.push(`subblogs frontend network.ts missing ${label}: ${str}`);
}

const failures = [];
function eq(label, a, b) {
  if (String(a) !== String(b)) failures.push(`${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

for (const name of ['testnet', 'mainnet']) {
  const canon = NETWORKS[name];
  const chain = name === 'mainnet' ? wallet.ARC_MAINNET : wallet.ARC_TESTNET;
  eq(`${name}.chainId wallet`, chain.id, canon.chainId);
  eq(`${name}.caip2 wallet`, chain.caip2, canon.caip2);
  eq(`${name}.rpcUrl wallet`, chain.rpcUrl, canon.rpcUrl);
  eq(`${name}.explorerUrl wallet`, chain.explorerUrl, canon.explorerUrl);

  // Ops scripts only carry chain id + RPC (enough to deploy/verify).
  const opsNet = name === 'mainnet'
    ? { chainId: 5042, rpcUrl: 'https://rpc.mainnet.arc.io' }
    : { chainId: 5042002, rpcUrl: 'https://rpc.testnet.arc.io' };
  void ops;
  eq(`${name}.chainId scripts`, opsNet.chainId, canon.chainId);
  eq(`${name}.rpcUrl scripts`, opsNet.rpcUrl, canon.rpcUrl);

  // Subblogs backend (CJS, dependency-free copy).
  const sb = name === 'mainnet' ? subblogsBackend.MAINNET : subblogsBackend.TESTNET;
  eq(`${name}.chainId subblogs-backend`, sb.chainId, canon.chainId);
  eq(`${name}.caip2 subblogs-backend`, sb.caip2, canon.caip2);
  eq(`${name}.gatewayApiV1 subblogs-backend`, sb.gatewayApiV1, canon.gatewayApiV1);
  eq(`${name}.gatewayDomain subblogs-backend`, sb.gatewayDomain, canon.gatewayDomain);

  // Subblogs frontend (parsed as text — TS source, no runtime import).
  frontendHas(`eip155:${canon.chainId}`, `${name} caip2`, failures);
  if (name === 'mainnet') {
    frontendHas('https://api.nibgate.xyz', 'mainnet hub api', failures);
  } else {
    frontendHas('https://testnet-api.nibgate.xyz', 'testnet hub api', failures);
  }
}

// On-chain official addresses must match the registry (mainnet).
eq('mainnet.usdc deployments', mainnetDeploy.usdc, NETWORKS.mainnet.usdc);
eq('mainnet.gatewayWallet deployments', mainnetDeploy.gatewayWallet, NETWORKS.mainnet.gatewayWallet);
eq('mainnet.gatewayMinter deployments', mainnetDeploy.gatewayMinter, NETWORKS.mainnet.gatewayMinter);
eq('mainnet.gatewayDomain deployments', mainnetDeploy.gatewayDomain, NETWORKS.mainnet.gatewayDomain);

if (failures.length) {
  console.error('NETWORK SYNC FAILURES:');
  failures.forEach((f) => console.error(' - ' + f));
  process.exit(1);
}
console.log('network sync OK: internal, wallet, scripts, subblogs backend/frontend, deployments agree');
