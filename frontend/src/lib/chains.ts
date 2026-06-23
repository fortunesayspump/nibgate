import { arcTestnet } from './wagmi'

export function isArcTestnetChainId(chainId?: number | string | null) {
  if (chainId === undefined || chainId === null) return false
  const numeric = typeof chainId === 'number'
    ? chainId
    : Number(chainId.startsWith('0x') ? BigInt(chainId) : chainId)
  return Number.isFinite(numeric) && numeric === arcTestnet.id
}

export function getConnectedChainId(accountChainId: number | undefined, activeChainId: number | undefined) {
  return accountChainId ?? activeChainId
}