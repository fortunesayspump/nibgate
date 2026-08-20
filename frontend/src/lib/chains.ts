import { arcTestnet } from '@nibgate/wallet'

export function isArcTestnetChainId(chainId?: number | string | null) {
  if (chainId === undefined || chainId === null) return false
  let numeric: number
  if (typeof chainId === 'number') numeric = chainId
  else if (chainId.includes(':')) numeric = Number(chainId.split(':').pop())
  else numeric = Number(chainId.startsWith('0x') ? BigInt(chainId) : chainId)
  return Number.isFinite(numeric) && numeric === arcTestnet.id
}
