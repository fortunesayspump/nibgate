'use client'

// Some injected wallets (MetaMask) keep per-origin permissions that can go
// stale — e.g. the site was previously authorized for a different account, or
// the connect approval hasn't fully settled. Calling eth_requestAccounts again
// through the active connector's provider re-authorizes the CURRENT account
// for this origin right before we ask for a signature, which avoids error 4100
// ("requested account and/or method has not been authorized") on personal_sign.
export async function ensureWalletAuthorized(connector) {
  if (!connector || typeof connector.getProvider !== 'function') return
  let provider
  try {
    provider = await connector.getProvider()
  } catch {
    return
  }
  if (!provider || typeof provider.request !== 'function') return
  try {
    await provider.request({ method: 'eth_requestAccounts' })
  } catch {
    // ignore — the actual sign request will surface real errors
  }
}
