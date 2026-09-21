import { defineChain } from 'viem';

// Published wallet standard — must stay dependency-free (no @nibgate/internal:
// this package ships to npm while internal is private). Mirror of the numeric
// params in @nibgate/internal networks.js; keep the two in sync.
//
// Active network: NEXT_PUBLIC_NIBGATE_NETWORK (browser) or NIBGATE_NETWORK
// (node), `mainnet` or anything-else-means-testnet. Defaults to testnet so a
// missing var can never move real money.

export const ARC_TESTNET = {
  id: 5_042_002,
  name: 'Arc Testnet',
  chainIdHex: '0x4CEF52',
  caip2: 'eip155:5042002',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrl: 'https://rpc.testnet.arc.io',
  appRpcUrl: 'https://testnet-api.nibgate.xyz/rpc',
  explorerUrl: 'https://testnet.arcscan.app',
  testnet: true,
};

export const ARC_MAINNET = {
  id: 5042,
  name: 'Arc',
  chainIdHex: '0x13B2',
  caip2: 'eip155:5042',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrl: 'https://rpc.mainnet.arc.io',
  appRpcUrl: 'https://api.nibgate.xyz/rpc',
  explorerUrl: 'https://explorer.arc.io',
  testnet: false,
};

export function activeNetworkName() {
  const raw = String(
    (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_NIBGATE_NETWORK || process.env.NIBGATE_NETWORK)) || 'testnet',
  ).toLowerCase();
  return raw === 'mainnet' ? 'mainnet' : 'testnet';
}

export function activeChain() {
  return activeNetworkName() === 'mainnet' ? ARC_MAINNET : ARC_TESTNET;
}

export function activeChainId() {
  return activeChain().id;
}

function chainDef(chain) {
  return defineChain({
    id: chain.id,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      default: {
        http: [appRpcUrlFor(chain)],
      },
    },
    blockExplorers: {
      default: {
        name: chain.testnet ? 'ArcScan Testnet' : 'Arc Explorer',
        url: chain.explorerUrl,
      },
    },
    testnet: chain.testnet,
  });
}

export const arcTestnet = chainDef(ARC_TESTNET);
export const arcMainnet = chainDef(ARC_MAINNET);

export function activeArcChain() {
  return activeNetworkName() === 'mainnet' ? arcMainnet : arcTestnet;
}

// The backend exposes a same-stack RPC proxy at /rpc (avoids third-party RPC
// CORS/rate limits). Resolves from the API base env so testnet builds hit the
// testnet backend and mainnet builds hit the mainnet backend.
export function apiBaseUrl() {
  const raw = (
    (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_API_URL || process.env.NIBGATE_PUBLIC_API_URL || process.env.PUBLIC_API_URL)) ||
    ''
  ).replace(/\/+$/, '');
  if (raw) return raw;
  return activeNetworkName() === 'mainnet' ? 'https://api.nibgate.xyz' : 'https://testnet-api.nibgate.xyz';
}

export function appRpcUrlFor(chain = activeChain()) {
  return `${apiBaseUrl()}/rpc`;
}

export function isArcNetwork(chainId) {
  if (chainId === undefined || chainId === null) return false;
  if (typeof chainId === 'string' && chainId.includes(':')) {
    return chainId === ARC_TESTNET.caip2 || chainId === ARC_MAINNET.caip2;
  }
  const numeric = Number(chainId);
  return numeric === ARC_TESTNET.id || numeric === ARC_MAINNET.id;
}

export function isArcTestnet(chainId) {
  if (chainId === undefined || chainId === null) return false;
  if (typeof chainId === 'string' && chainId.includes(':')) return chainId === ARC_TESTNET.caip2;
  return Number(chainId) === ARC_TESTNET.id;
}

export function explorerTxUrl(txHash, chain = activeChain()) {
  return `${chain.explorerUrl}/tx/${txHash}`;
}

export function getAddArcNetworkParams(chain = activeChain()) {
  return {
    chainId: chain.chainIdHex,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [chain.rpcUrl],
    blockExplorerUrls: [chain.explorerUrl],
  };
}
