'use client'

import type { ReactNode } from 'react'
import { NibgateWalletProvider } from '@nibgate/wallet/react'

export function Providers({ children }: { children: ReactNode }) {
  return <NibgateWalletProvider>{children}</NibgateWalletProvider>
}
