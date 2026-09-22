import { activeArcChain, activeChain, explorerTxUrl, isArcNetwork } from '@nibgate/wallet'

export function isArcTestnetChainId(chainId?: number | string | null) {
  if (chainId === undefined || chainId === null) return false
  let numeric: number
  if (typeof chainId === 'number') numeric = chainId
  else if (chainId.includes(':')) numeric = Number(chainId.split(':').pop())
  else numeric = Number(chainId.startsWith('0x') ? BigInt(chainId) : chainId)
  return Number.isFinite(numeric) && numeric === 5_042_002
}

export function isArcChainId(chainId?: number | string | null) {
  return isArcNetwork(chainId ?? undefined)
}

// Whether the connected wallet sits on THIS build's network (mainnet 5042 vs
// testnet 5042002). Use for wrong-network warnings — never accept the other
// Nibgate network as correct, or users would pay on the wrong chain.
export function isActiveChainId(chainId?: number | string | null) {
  if (chainId === undefined || chainId === null) return false
  let numeric: number
  if (typeof chainId === 'number') numeric = chainId
  else if (chainId.includes(':')) numeric = Number(chainId.split(':').pop())
  else numeric = Number(chainId.startsWith('0x') ? BigInt(chainId) : chainId)
  return Number.isFinite(numeric) && numeric === activeChain().id
}

// Active Arc chain for this build (NEXT_PUBLIC_NIBGATE_NETWORK).
export function activeChainConfig() {
  return activeChain()
}

export function activeViemChain() {
  return activeArcChain()
}

// Explorer link for a tx hash on the active network.
export function explorerTxLink(txHash: string) {
  return explorerTxUrl(txHash)
}
