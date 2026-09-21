// Active deployment network for this build (NEXT_PUBLIC_NIBGATE_NETWORK).
export function activeNetworkName(): 'mainnet' | 'testnet' {
  return (process.env.NEXT_PUBLIC_NIBGATE_NETWORK || 'testnet').toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet';
}

// Production API default follows the build network: explicit
// NEXT_PUBLIC_API_URL always wins (local dev, previews, testnet deploys).
export function defaultApiBaseUrl() {
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return activeNetworkName() === 'mainnet' ? 'https://api.nibgate.xyz' : 'https://testnet-api.nibgate.xyz';
}

export function siteOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (raw) return raw.replace(/\/+$/, '');
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3001';
  return activeNetworkName() === 'mainnet' ? 'https://nibgate.xyz' : 'https://testnet.nibgate.xyz';
}

export function apiBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL || defaultApiBaseUrl();
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

export function apiUrl(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl()}${cleanPath}`;
}
