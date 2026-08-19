import { defineChain } from 'viem';

export const ARC_TESTNET = {
  id: 5_042_002,
  name: 'Arc Testnet',
  chainIdHex: '0x4CEF52',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrl: 'https://rpc.testnet.arc.io',
  appRpcUrl: 'https://api.nibgate.xyz/rpc',
  explorerUrl: 'https://testnet.arcscan.app',
};

export const arcTestnet = defineChain({
  id: ARC_TESTNET.id,
  name: ARC_TESTNET.name,
  nativeCurrency: ARC_TESTNET.nativeCurrency,
  rpcUrls: {
    default: {
      http: [ARC_TESTNET.appRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: ARC_TESTNET.explorerUrl,
    },
  },
  testnet: true,
});

export function isArcNetwork(chainId) {
  if (chainId === undefined || chainId === null) return false;
  if (typeof chainId === 'string' && chainId.includes(':')) {
    return chainId === `eip155:${ARC_TESTNET.id}`;
  }
  return Number(chainId) === ARC_TESTNET.id;
}

export function getAddArcNetworkParams() {
  return {
    chainId: ARC_TESTNET.chainIdHex,
    chainName: ARC_TESTNET.name,
    nativeCurrency: ARC_TESTNET.nativeCurrency,
    rpcUrls: [ARC_TESTNET.rpcUrl],
    blockExplorerUrls: [ARC_TESTNET.explorerUrl],
  };
}
