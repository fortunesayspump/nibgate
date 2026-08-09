export const HUB_SESSION_CLEARED_EVENT = 'nibgate:hub-session-cleared'

export async function getHubSessionAddress(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    const raw = data?.authenticated ? data.user?.wallets?.[0]?.address : ''
    return /^0x[a-fA-F0-9]{40}$/.test(raw ?? '') ? raw : null
  } catch {
    return null
  }
}
