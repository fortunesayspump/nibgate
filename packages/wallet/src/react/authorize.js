'use client'

// Some injected wallets (MetaMask) keep per-origin permissions that can go
// stale — e.g. the site was previously authorized for a different account, or
// the connect approval hasn't fully settled. Calling eth_requestAccounts again
// through the active wallet provider re-authorizes the CURRENT account for this
// origin right before we ask for a signature, which avoids error 4100
// ("requested account and/or method has not been authorized") on personal_sign.
//
// This uses AppKit's `walletProvider` directly (the reconciled source of
// truth) rather than wagmi's connector, which may be null if wagmi's account
// state hasn't caught up to AppKit yet — that null is exactly what made wagmi
// throw "Connector not connected".
export async function ensureWalletAuthorized(address, { walletProvider } = {}) {
  if (!walletProvider || typeof walletProvider.request !== 'function') return
  if (!address) return
  const accounts = await walletProvider.request({ method: 'eth_requestAccounts' })
  const granted = Array.isArray(accounts) && accounts.length ? accounts[0] : null
  if (granted && granted.toLowerCase() !== address.toLowerCase()) {
    // Wrong account approved — AppKit will reconcile on next event; surface so
    // the caller doesn't silently sign the SIWE message with the wrong key.
    const err = new Error(`Connected account mismatch: ${granted}`)
    err.code = 4001
    throw err
  }
}
