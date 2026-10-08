// Network selection for the extension. Testnet default (free faucet USDC);
// user flips to mainnet in the popup when ready for real tips. Persisted in
// chrome.storage so content script, worker, and popup agree.
export type NetworkName = 'testnet' | 'mainnet';

export const NETWORKS: Record<
  NetworkName,
  { label: string; hubApi: string; chainId: number; caip2: string; faucet: string | null; rpcUrl: string; gatewayApi: string; gatewayDomain: number; explorer: string }
> = {
  testnet: {
    label: 'Testnet',
    hubApi: 'https://testnet-api.nibgate.xyz',
    chainId: 5042002,
    caip2: 'eip155:5042002',
    faucet: 'https://faucet.circle.com',
    rpcUrl: 'https://rpc.testnet.arc.io',
    gatewayApi: 'https://gateway-api-testnet.circle.com',
    gatewayDomain: 26,
    explorer: 'https://testnet.arcscan.app',
  },
  mainnet: {
    label: 'Mainnet',
    hubApi: 'https://api.nibgate.xyz',
    chainId: 5042,
    caip2: 'eip155:5042',
    faucet: null,
    rpcUrl: 'https://rpc.mainnet.arc.io',
    gatewayApi: 'https://gateway-api.circle.com',
    gatewayDomain: 26,
    explorer: 'https://explorer.arc.io',
  },
};

const KEY = 'nibgateNetwork';
const LEGACY_KEY = 'nibTipNetwork';
const CUSTOM_HUB_KEY = 'nibgateCustomHubApi';

export async function getNetwork(): Promise<NetworkName> {
  try {
    const stored = await chrome.storage.local.get([KEY, LEGACY_KEY]);
    const v = stored[KEY] ?? stored[LEGACY_KEY];
    return v === 'mainnet' ? 'mainnet' : 'testnet';
  } catch {
    return 'testnet';
  }
}

export async function setNetwork(name: NetworkName): Promise<void> {
  await chrome.storage.local.set({ [KEY]: name });
}

// Dev/staging hub override, set at build time (NIBGATE_HUB_API env). Falls back
// to a stored value so local tooling/tests can point at a local hub.
export async function getCustomHubApi(): Promise<string> {
  try {
    const stored = await chrome.storage.local.get([CUSTOM_HUB_KEY]);
    const value = String(stored[CUSTOM_HUB_KEY] || '').trim().replace(/\/+$/, '');
    if (value) return value;
  } catch {}
  return typeof __NIBGATE_HUB_API__ === 'string' ? __NIBGATE_HUB_API__.trim().replace(/\/+$/, '') : '';
}

export async function setCustomHubApi(url: string): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_HUB_KEY]: String(url || '').trim().replace(/\/+$/, '') });
}

export async function activeNetwork() {
  const base = NETWORKS[await getNetwork()];
  const customHubApi = await getCustomHubApi();
  return customHubApi ? { ...base, hubApi: customHubApi } : base;
}
