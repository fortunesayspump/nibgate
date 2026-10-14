'use client'

// Verify the currently authorized account before signing. Request access only
// when the provider reports no granted accounts: embedded social wallets do
// not support the injected-wallet eth_requestAccounts approval flow.
//
// This uses AppKit's `walletProvider` directly (the reconciled source of
// truth) rather than wagmi's connector, which may be null if wagmi's account
// state hasn't caught up to AppKit yet — that null is exactly what made wagmi
// throw "Connector not connected".
export async function ensureWalletAuthorized(address, { walletProvider } = {}) {
  if (!walletProvider || typeof walletProvider.request !== 'function') return
  if (!address) return
  // Social wallets already grant access during login and may not implement
  // eth_requestAccounts. Read the granted account before requesting access.
  // Do not swallow provider failures or accept a different selected account.
  let accounts = await walletProvider.request({ method: 'eth_accounts' })
  if (Array.isArray(accounts) && accounts.length === 0) {
    accounts = await walletProvider.request({ method: 'eth_requestAccounts' })
  }
  const granted = Array.isArray(accounts) && accounts.length ? accounts[0] : null
  if (typeof granted !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(granted)) {
    const err = new Error('Wallet did not authorize an account. Reconnect and approve access to continue.')
    err.code = 4100
    throw err
  }
  if (granted.toLowerCase() !== address.toLowerCase()) {
    // Wrong account approved — AppKit will reconcile on next event; surface so
    // the caller doesn't silently sign the SIWE message with the wrong key.
    // Distinct code (NOT 4001): this is a race, not a user cancellation, and
    // must never be worded as "cancelled".
    const err = new Error(`Wallet is on ${granted} but this session is for ${address}. Sign in again to continue.`)
    err.code = 'ACCOUNT_MISMATCH'
    throw err
  }
}
