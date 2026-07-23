import { createAppKit } from '@reown/appkit/react'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})

export const appKitProjectId = '09580756f3c5f13c5f1aeb2faa9b1696'

const rpcUrl = 'https://rpc.testnet.arc.io'

const connectors = [
  injected(),
  injected({ target: 'metaMask' }),
  injected({ target: 'rabby' }),
]

const transports = {
  [arcTestnet.id]: http(rpcUrl),
}

const appKitNetworks = [arcTestnet as AppKitNetwork] as [AppKitNetwork, ...AppKitNetwork[]]

const metadata = {
  name: 'Nibgate',
  description: 'Nibgate Creator Platform',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://nibgate.xyz',
  icons: [typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : 'https://nibgate.xyz/favicon.ico'],
}

const wagmiAdapter = new WagmiAdapter({
  networks: appKitNetworks,
  projectId: appKitProjectId,
  ssr: true,
  connectors,
  transports,
})

export const wagmiConfig = wagmiAdapter.wagmiConfig

createAppKit({
  adapters: [wagmiAdapter],
  networks: appKitNetworks,
  defaultNetwork: arcTestnet as AppKitNetwork,
  allowUnsupportedChain: true,
  projectId: appKitProjectId,
  metadata,
  themeMode: 'light',
  themeVariables: {
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
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
    swaps: false,
    onramp: false,
  },
})
