'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { createNibgateWallet } from './appkit.js'
import { ArcConnectionNotice } from './ArcConnectionNotice.jsx'

const APPKIT_CONNECTION_KEY = '@appkit/connection_status'

// After a hard cache/cookie clear, AppKit (and wagmi) no longer have a valid
// connector. wagmi's `reconnectOnMount` then fires `reconnect()` which calls
// `eth_requestAccounts` on a session the browser has already forgotten,
// rejecting with "The requested method and/or account has not been authorized"
// and leaving `connector` null, which wagmi turns into
// "Connector not connected". Only auto-reconnect when AppKit actually reports
// an existing session, so a wiped cache degrades gracefully to the connect
// button instead of crashing the page.
function useAutoReconnect() {
  // Wagmi Hydrate consumes reconnectOnMount only in its first mount effect.
  // Waiting for an AppKit effect/activeChain made this permanently false on
  // reload, even with a valid saved session. Read only the existing marker;
  // absent/cleared storage still never triggers unsolicited authorization.
  const [connected]=useState(()=>{
    if(typeof window==='undefined')return false;
    try{return localStorage.getItem(APPKIT_CONNECTION_KEY)==='connected';}
    catch{return false;}
  });
  return connected;
}

export function NibgateWalletProvider({ children, ...options }) {
  const [state] = useState(() => createNibgateWallet(options))
  const [queryClient] = useState(() => new QueryClient())
  const autoReconnect = useAutoReconnect()

  const wagmiConfig = useMemo(() => state?.wagmiConfig ?? null, [state])

  if (!state || !wagmiConfig) return children

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={autoReconnect}>
      <QueryClientProvider client={queryClient}><ArcConnectionNotice />{children}</QueryClientProvider>
    </WagmiProvider>
  )
}