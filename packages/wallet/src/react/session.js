export const HUB_SESSION_UPDATED_EVENT = 'nibgate:hub-session-updated'
export const HUB_SESSION_CLEARED_EVENT = 'nibgate:hub-session-cleared'

export function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
}

export async function getSessionAddress(options = {}) {
  const authBase = options.authBase || ''
  const sessionPath = options.sessionPath || '/auth/me'
  try {
    const res = await fetch(`${authBase}${sessionPath}`, {
      credentials: 'include',
      ...(options.fetchOptions || {}),
    })
    const data = await res.json().catch(() => ({}))
    const raw = data?.authenticated ? data.user?.wallets?.[0]?.address : ''
    return /^0x[a-fA-F0-9]{40}$/.test(raw ?? '') ? raw : null
  } catch {
    return null
  }
}
