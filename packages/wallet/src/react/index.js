export {
  createNibgateWallet,
  NIBGATE_APPKIT_PROJECT_ID,
  NIBGATE_RPC_URL,
} from './appkit.js'
export { NibgateWalletProvider } from './NibgateWalletProvider.jsx'
export { signInWithSiwe, signMessageWithProvider } from './siwe.js'
export {
  HUB_SESSION_UPDATED_EVENT,
  HUB_SESSION_CLEARED_EVENT,
  getSessionAddress,
  shortAddress,
} from './session.js'
export { useNibgateConnect } from './useNibgateConnect.js'
export { GatewayWalletUI } from './gateway-wallet.jsx'
export {
  NIBGATE_REPUTATION_ABI,
  NIBGATE_REPUTATION_CHAIN_ID,
  NIBGATE_REPUTATION_CHAIN_NAME,
  NIBGATE_REPUTATION_CONTRACT,
} from './rating.jsx'
export { NibgateRatingUI } from './rating.jsx'
export {
  useNibgateUnlock,
  NibgateUnlock,
  NibgateUnlockUI,
} from './unlock.jsx'

// Single source of the React wallet stack. Import wagmi / AppKit /
// react-query primitives from `@nibgate/wallet/react` (not the underlying
// packages directly) so every Nibgate consumer shares one instance —
// AppKit modal state and the WagmiProvider context must not be duplicated.
export {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

export {
  WagmiProvider,
  useAccount,
  useBalance,
  useChainId,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useSwitchChain,
  createConfig,
} from 'wagmi'

export {
  createAppKit,
  AppKitProvider,
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useAppKitState,
  useDisconnect,
} from '@reown/appkit/react'
