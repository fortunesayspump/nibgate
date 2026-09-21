// Shared Arc network defaults for ops scripts (deploy/verify/seed).
// Usage: import { networkDefaults } from './network.mjs';
//   const { rpcUrl, chainId, chainName } = networkDefaults({
//     rpcEnv: ['NIBGATE_REPUTATION_RPC_URL', 'ARC_TESTNET_RPC_URL', 'RPC_URL'],
//     chainIdEnv: ['NIBGATE_REPUTATION_CHAIN_ID', 'CHAIN_ID'],
//     chainNameEnv: ['NIBGATE_REPUTATION_CHAIN_NAME'],
//   });
// Explicit env vars always win; otherwise NIBGATE_NETWORK (default testnet)
// picks the Arc testnet vs mainnet endpoints. Scripts that move real money
// MUST be run with NIBGATE_NETWORK=mainnet explicitly.
const NETWORKS = {
  testnet: { chainId: 5042002, chainName: 'Arc Testnet', rpcUrl: 'https://rpc.testnet.arc.io' },
  mainnet: { chainId: 5042, chainName: 'Arc', rpcUrl: 'https://rpc.mainnet.arc.io' },
};

export function activeNetworkName() {
  return String(process.env.NIBGATE_NETWORK || 'testnet').toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet';
}

function firstEnv(names) {
  for (const n of names || []) {
    if (process.env[n]) return process.env[n];
  }
  return '';
}

export function networkDefaults({ rpcEnv = [], chainIdEnv = [], chainNameEnv = [] } = {}) {
  const net = NETWORKS[activeNetworkName()];
  return {
    network: activeNetworkName(),
    rpcUrl: firstEnv(rpcEnv) || net.rpcUrl,
    chainId: Number.parseInt(firstEnv(chainIdEnv) || String(net.chainId), 10),
    chainName: firstEnv(chainNameEnv) || net.chainName,
  };
}
