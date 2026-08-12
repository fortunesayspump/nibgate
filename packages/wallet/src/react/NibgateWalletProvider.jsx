'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { createNibgateWallet } from './appkit.js'

export function NibgateWalletProvider({ children, ...options }) {
  const [state] = useState(() => createNibgateWallet(options))
  const [queryClient] = useState(() => new QueryClient())

  if (!state) return children

  return (
    <WagmiProvider config={state.wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
