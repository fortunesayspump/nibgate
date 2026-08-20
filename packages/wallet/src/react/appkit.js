'use client'

import { createAppKit } from '@reown/appkit/react'
import { arcTestnet } from '../chain.js'

export const NIBGATE_APPKIT_PROJECT_ID = '09580756f3c5f13c5f1aeb2faa9b1696'
export const NIBGATE_RPC_URL = 'https://api.nibgate.xyz/rpc'

const DEFAULT_THEME_VARIABLES = {
  '--apkt-accent': '#7C9A6D',
  '--apkt-color-mix': '#E7EFE4',
  '--apkt-color-mix-strength': 15,
  '--apkt-font-family': '"Kumbh Sans", "ABC Favorit", sans-serif',
  '--apkt-font-size-master': '10px',
  '--apkt-border-radius-master': '4px',
  '--w3m-accent': '#7C9A6D',
  '--w3m-color-mix': '#E7EFE4',
  '--w3m-color-mix-strength': 15,
  '--w3m-font-family': '"Kumbh Sans", "ABC Favorit", sans-serif',
  '--w3m-font-size-master': '10px',
  '--w3m-border-radius-master': '4px',
}

const DEFAULT_FEATURES = {
  analytics: false,
  email: false,
  socials: false,
  swaps: false,
  onramp: false,
}

const STORAGE_VERSION_KEY = 'nibgate.wallet.state-version'
const STORAGE_VERSION = '0.4.0'

const APP_KIT_KEYS = [
  '@appkit/wallet_id',
  '@appkit/wallet_name',
  '@appkit/solana_wallet',
  '@appkit/solana_caip_chain',
  '@appkit/active_caip_network_id',
  '@appkit/connected_social',
  '@appkit-wallet/SOCIAL_USERNAME',
  '@appkit/recent_wallets',
  '@appkit/recent_wallet',
  'WALLETCONNECT_DEEPLINK_CHOICE',
  '@appkit/active_namespace',
  '@appkit/connected_namespaces',
  '@appkit/connection_status',
  '@appkit/siwx-auth-token',
  '@appkit/siwx-nonce-token',
  '@appkit/social_provider',
  '@appkit/native_balance_cache',
  '@appkit/portfolio_cache',
  '@appkit/ens_cache',
  '@appkit/identity_cache',
  '@appkit/preferred_account_types',
  '@appkit/connections',
  '@appkit/disconnected_connector_ids',
  '@appkit/history_transactions_cache',
  '@appkit/token_price_cache',
  '@appkit/recent_emails',
  '@appkit/latest_version',
  '@appkit/ton_wallets_cache',
]

const APP_KIT_PREFIXES = ['@appkit/', '@w3m-app/', '@w3m-frame/']

function clearStaleWalletState() {
  if (typeof window === 'undefined') return
  try {
    for (const key of APP_KIT_KEYS) localStorage.removeItem(key)
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i)
      if (key && APP_KIT_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key)
    }
    localStorage.removeItem('walletconnect')
  } catch {
    // ignore storage failures (private mode, disabled storage)
  }
}

function clearStaleWalletStateIfVersionChanged() {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) return
    clearStaleWalletState()
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
  } catch {
    // ignore storage failures
  }
}

let cached = null

// Adapter-less AppKit: no wagmi / ethers adapter is registered. AppKit ships a
// UniversalAdapter (WalletConnect) plus built-in EIP-6963 discovery for injected
// wallets out of the box, so every wallet gets its own provider from the modal —
// no window.ethereum race, no duplicated injected connectors. All signing,
// chain switching, and sending go through the EIP-1193 provider surfaced by
// useAppKitProvider('eip155') (see unlock.jsx / useNibgateConnect.js).
export function createNibgateWallet(options = {}) {
  clearStaleWalletStateIfVersionChanged()
  if (cached) return cached

  const projectId = options.projectId || NIBGATE_APPKIT_PROJECT_ID
  const networks = options.chains && options.chains.length ? options.chains : [arcTestnet]
  const customRpcUrls = options.rpcUrl
    ? { [`eip155:${networks[0].id}`]: options.rpcUrl }
    : undefined

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nibgate.xyz'
  const metadata = options.metadata || {
    name: 'Nibgate',
    description: 'Nibgate Creator Platform',
    url: origin,
    icons: [origin + '/favicon.ico'],
  }

  createAppKit({
    networks,
    defaultNetwork: options.defaultNetwork || networks[0],
    allowUnsupportedChain: options.allowUnsupportedChain ?? true,
    customRpcUrls,
    projectId,
    metadata,
    themeMode: options.themeMode || 'light',
    themeVariables: options.themeVariables || DEFAULT_THEME_VARIABLES,
    features: { ...DEFAULT_FEATURES, ...(options.features || {}) },
  })

  cached = {
    appKitNetworks: networks,
    projectId,
  }
  return cached
}