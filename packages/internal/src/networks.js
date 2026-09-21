// Canonical Arc network registry for Nibgate.
// One entry per deployment network. Anything chain-specific (chain id, RPC,
// explorer, Circle Gateway endpoints, USDC + Gateway contract addresses) MUST
// come from here — never hardcode a second copy elsewhere.
//
// Selection: NIBGATE_NETWORK=mainnet|testnet (backend/Node) or
// NEXT_PUBLIC_NIBGATE_NETWORK (browser builds). Defaults to testnet so a
// missing var can never move real money.

const USDC_SAME_BOTH_NETWORKS = '0x3600000000000000000000000000000000000000';

export const NETWORKS = {
  testnet: {
    name: 'testnet',
    label: 'Arc Testnet',
    chainId: 5_042_002,
    chainIdHex: '0x4CEF52',
    caip2: 'eip155:5042002',
    rpcUrl: 'https://rpc.testnet.arc.io',
    explorerUrl: 'https://testnet.arcscan.app',
    gatewayApi: 'https://gateway-api-testnet.circle.com',
    gatewayApiV1: 'https://gateway-api-testnet.circle.com/v1',
    facilitatorUrl: 'https://gateway-api-testnet.circle.com',
    usdc: USDC_SAME_BOTH_NETWORKS,
    // Circle Gateway contracts on Arc testnet (domain 26).
    gatewayWallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
    gatewayMinter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
    gatewayDomain: 26,
    reputationRpcUrl: 'https://rpc.testnet.arc.io',
    isTestnet: true,
  },
  mainnet: {
    name: 'mainnet',
    label: 'Arc',
    chainId: 5042,
    chainIdHex: '0x13B2',
    caip2: 'eip155:5042',
    rpcUrl: 'https://rpc.mainnet.arc.io',
    explorerUrl: 'https://explorer.arc.io',
    gatewayApi: 'https://gateway-api.circle.com',
    gatewayApiV1: 'https://gateway-api.circle.com/v1',
    facilitatorUrl: 'https://gateway-api.circle.com',
    usdc: USDC_SAME_BOTH_NETWORKS,
    // Circle Gateway contracts on Arc mainnet (domain 26).
    gatewayWallet: '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE',
    gatewayMinter: '0x2222222d7164433c4C09B0b0D809a9b52C04C205',
    gatewayDomain: 26,
    reputationRpcUrl: 'https://rpc.mainnet.arc.io',
    isTestnet: false,
  },
};

export function activeNetworkName() {
  const raw = (
    process.env.NIBGATE_NETWORK ||
    process.env.NEXT_PUBLIC_NIBGATE_NETWORK ||
    'testnet'
  ).toLowerCase();
  return raw === 'mainnet' ? 'mainnet' : 'testnet';
}

export function activeNetwork() {
  return NETWORKS[activeNetworkName()];
}

export function networkByChainId(chainId) {
  if (chainId === undefined || chainId === null) return null;
  let numeric = chainId;
  if (typeof chainId === 'string') {
    if (chainId.includes(':')) numeric = Number(chainId.split(':').pop());
    else numeric = Number(chainId.startsWith('0x') ? BigInt(chainId) : chainId);
  }
  numeric = Number(numeric);
  return Object.values(NETWORKS).find((n) => n.chainId === numeric) || null;
}

// Canonical Nibgate hosts per network. Mainnet owns the bare domains;
// the testnet stack lives under testnet.* prefixes on the same apex.
export const NETWORK_HOSTS = {
  mainnet: {
    siteOrigin: 'https://nibgate.xyz',
    apiBase: 'https://api.nibgate.xyz',
    shareBase: 'https://nibgate.xyz/ns',
    widgetUrl: 'https://www.nibgate.xyz/widget.js',
  },
  testnet: {
    siteOrigin: 'https://testnet.nibgate.xyz',
    apiBase: 'https://testnet-api.nibgate.xyz',
    shareBase: 'https://testnet.nibgate.xyz/ns',
    widgetUrl: 'https://testnet.nibgate.xyz/widget.js',
  },
};

export function hostsFor(networkName = activeNetworkName()) {
  return NETWORK_HOSTS[networkName] || NETWORK_HOSTS.testnet;
}

// Testnet alias forms for site `<name>` (both resolve to the same site row;
// the canonical subdomain used for hub linking, hashes, and emails stays `<name>`):
//   <name>.testnet.nibgate.xyz   (canonical — covered by the *.testnet wildcard)
//   testnet-<name>.nibgate.xyz    (legacy exact domains, pre-wildcard backfill)
// Mainnet serves <name>.nibgate.xyz only.
export const TESTNET_SUBDOMAIN_PREFIX = 'testnet-';

export function canonicalSubdomain(subdomain = '') {
  const clean = String(subdomain || '').trim().toLowerCase();
  if (clean.startsWith(TESTNET_SUBDOMAIN_PREFIX) && clean.length > TESTNET_SUBDOMAIN_PREFIX.length) {
    return clean.slice(TESTNET_SUBDOMAIN_PREFIX.length);
  }
  return clean;
}

export function isTestnetAliasSubdomain(subdomain = '') {
  return String(subdomain || '').trim().toLowerCase().startsWith(TESTNET_SUBDOMAIN_PREFIX);
}
