'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit, useAppKitState, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { getWalletErrorMessage, isWalletRejection } from '../errors.js'
import { ensureWalletAuthorized } from './authorize.js'
import { signInWithSiwe, signMessageWithProvider } from './siwe.js'
import { HUB_SESSION_UPDATED_EVENT, HUB_SESSION_CLEARED_EVENT, getSessionAddress } from './session.js'

export function useNibgateConnect(options = {}) {
  const { authBase = '', noncePath, verifyPath } = options
  const { open } = useAppKit()
  const { open: modalOpen, connectingWallet } = useAppKitState()
  // Use AppKit's account hook (not wagmi's useAccount) so sign-in flows through
  // AppKit's own connector reconciliation — this avoids wagmi throwing
  // "Connector not connected" when its account state lags AppKit's.
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('eip155')

  const addressRef = useRef(null)
  const isConnectedRef = useRef(false)
  const modalOpenRef = useRef(false)
  const connectingWalletRef = useRef(false)
  const runningRef = useRef(false)
  // Kept in a ref because detectSilentSession runs inside connect() and must not
  // re-create the callback when the provider object identity changes.
  const walletProviderRef = useRef(walletProvider)
  useEffect(() => { walletProviderRef.current = walletProvider }, [walletProvider])

  useEffect(() => { addressRef.current = address ? `0x${String(address).replace(/^0x/, '')}` : null }, [address])
  useEffect(() => { isConnectedRef.current = isConnected }, [isConnected])
  useEffect(() => { modalOpenRef.current = modalOpen }, [modalOpen])
  useEffect(() => { connectingWalletRef.current = connectingWallet }, [connectingWallet])

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [chainId, setChainId] = useState(null)

  const clearError = useCallback(() => setError(null), [])

  // Call when an authed hub call returns 401: the cookie session is gone
  // (expiry, logout elsewhere, cleared cookies). Never auto-signs — prompts.
  const notifySessionExpired = useCallback(() => {
    setStatus('idle')
    setError('Session expired — sign in again to continue.')
  }, [])

  // Wallet-initiated changes: account or chain switched outside the app.
  // The hub cookie stays bound to the OLD address, so continuing blindly
  // signs with one key while authed as another — the classic mystery
  // "signing issue". Surface it instead: new address shows, session must be
  // re-established with one explicit tap. Never auto-signs.
  useEffect(() => {
    const provider = walletProviderRef.current
    if (!provider || typeof provider.on !== 'function') return undefined
    const norm = (a) => (a ? `0x${String(a).replace(/^0x/, '').toLowerCase()}` : null)
    const onAccountsChanged = (accounts) => {
      const next = Array.isArray(accounts) && accounts.length ? norm(accounts[0]) : null
      const current = addressRef.current ? norm(addressRef.current) : null
      if (!next) {
        // Wallet disconnected/locked: drop to idle, session is unusable.
        setStatus('idle')
        setError('Wallet disconnected. Connect again to continue.')
        return
      }
      if (current && next !== current) {
        setStatus('idle')
        setError('Account changed in your wallet — sign in again to continue.')
      }
    }
    const onChainChanged = (value) => {
      const next = typeof value === 'string' && /^0x/i.test(value) ? Number(value) : Number(value)
      setChainId(Number.isFinite(next) ? next : null)
    }
    provider.on('accountsChanged', onAccountsChanged)
    provider.on('chainChanged', onChainChanged)
    // Seed current chain without prompting.
    try {
      const maybe = provider.request?.({ method: 'eth_chainId' })
      if (maybe && typeof maybe.then === 'function') {
        maybe.then((v) => {
          const n = typeof v === 'string' && /^0x/i.test(v) ? Number(v) : Number(v)
          if (Number.isFinite(n)) setChainId(n)
        }).catch(() => {})
      }
    } catch {}
    return () => {
      try { provider.removeListener?.('accountsChanged', onAccountsChanged) } catch {}
      try { provider.removeListener?.('chainChanged', onChainChanged) } catch {}
    }
  }, [walletProvider])

  // Cross-tab sessions: a sign-in elsewhere only fires a same-window event.
  // Mirror it through localStorage so every tab re-checks instead of acting
  // on a stale address.
  useEffect(() => {
    const onStorage = (e) => {
      if (!e || e.key !== HUB_SESSION_UPDATED_EVENT) return
      setStatus('idle')
      setError('Signed in on another tab — sign in again here to continue.')
    };
    try {
      window.addEventListener('storage', onStorage)
    } catch {}
    return () => {
      try {
        window.removeEventListener('storage', onStorage)
      } catch {}
    }
  }, [])

  async function waitForWallet(timeoutMs = 30000) {    const started = Date.now()
    let sawModalOpen = false
    let modalClosedAt = 0
    const GRACE_MS = 6000 // after AppKit's modal closes, give the connector a moment to reconcile
    while (Date.now() - started < timeoutMs) {
      const addr = addressRef.current
      if (addr) return addr
      if (modalOpenRef.current) {
        sawModalOpen = true
        modalClosedAt = 0
      } else if (sawModalOpen && !connectingWalletRef.current) {
        if (modalClosedAt === 0) modalClosedAt = Date.now()
        if (Date.now() - modalClosedAt >= GRACE_MS) return null
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return null
  }

  // AppKit's account state and provider state can settle at different times
  // (slow/lazy connectors, mock providers, mobile round-trips): the address
  // may show while useAppKitProvider is still null. Never sign blind — wait
  // for a usable provider, then fail loudly instead of a generic error.
  async function waitForProvider(timeoutMs = 15000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const p = walletProviderRef.current
      if (p && typeof p.request === 'function') return p
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return null
  }

  async function sign(addr) {
    const provider = await waitForProvider()
    if (!provider) throw new Error('Wallet provider is not available. Reconnect your wallet and try again.')
    await ensureWalletAuthorized(addr, { walletProvider: provider, appKitAccount: { address: addr } })
    setStatus('signing')
    await signInWithSiwe(addr, (message) => signMessageWithProvider(provider, addr, message), { authBase, noncePath, verifyPath })
    setStatus('signed-in')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(HUB_SESSION_UPDATED_EVENT))
      // Cross-tab mirror (same-window events don't cross tabs).
      try {
        localStorage.setItem(HUB_SESSION_UPDATED_EVENT, String(Date.now()))
      } catch {}
    }
  }

  const signIn = useCallback(async () => {
    if (runningRef.current) return false
    const addr = addressRef.current
    if (!addr) {
      setStatus('error')
      setError('Wallet not connected.')
      return false
    }
    runningRef.current = true
    setBusy(true)
    setStatus('signing')
    setError(null)
    try {
      await sign(addr)
      return true
    } catch (err) {
      if (err?.code === 'ACCOUNT_MISMATCH') {
        // In-wallet account flip raced the sign: never word this as a
        // cancellation, and land somewhere a single retry fixes.
        setStatus('idle')
        setError(err.message)
      } else if (isWalletRejection(err)) {
        // Same reasoning as connect(): a rejection is expected when someone
        // dismisses the SIWE prompt, so name it instead of appearing to hang.
        setStatus('idle')
        setError('Sign-in cancelled. Tap Sign in again when you\'re ready.')
      } else {
        setError(getWalletErrorMessage(err))
        setStatus('error')
      }
      return false
    } finally {
      setBusy(false)
      runningRef.current = false
    }
  }, [address, walletProvider, authBase, noncePath, verifyPath])

  // A silent probe for an already-authorized wallet. eth_accounts NEVER shows a
  // prompt, so this is safe to call speculatively.
  //
  // This exists because of a mobile-specific failure: if the wallet still holds
  // a live session (common after a dApp was backgrounded, or when another tab
  // is connected), re-opening the modal makes the wallet auto-decline with
  // "a previous request is still pending" / "connection already active". Asking
  // eth_accounts first reuses that session instead of starting a doomed race.
  async function detectSilentSession() {
    const provider = walletProviderRef?.current
    if (!provider || typeof provider.request !== 'function') return null
    try {
      const accounts = await provider.request({ method: 'eth_accounts' })
      const first = Array.isArray(accounts) ? accounts[0] : null
      return first ? `0x${String(first).replace(/^0x/, '')}` : null
    } catch {
      return null
    }
  }

  // EIP-6963 census: do any wallets announce? Legacy (pre-6963) extensions
  // only set window.ethereum, which the AppKit modal never lists — there is
  // no click path for them. Detect that case and connect directly.
  async function countAnnouncedProviders(timeoutMs = 1200) {
    if (typeof window === 'undefined') return 0
    let count = 0
    const seen = new Set()
    const onAnnounce = (e) => {
      const id = e?.detail?.info?.rdns || e?.detail?.info?.uuid || e?.detail?.info?.name
      if (id && !seen.has(id)) {
        seen.add(id)
        count += 1
      }
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    try {
      window.dispatchEvent(new Event('eip6963:requestProvider'))
      await new Promise((resolve) => setTimeout(resolve, timeoutMs))
    } finally {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
    }
    return count
  }

  // Legacy direct connect: bypass the modal with wagmi's injected connector
  // (falls back to window.ethereum). AppKit syncs external wagmi connections
  // into its own state, so the rest of the flow is unchanged.
  async function connectLegacyDirect() {
    const { getNibgateWagmiConfig } = await import('./appkit.js')
    const config = getNibgateWagmiConfig()
    const connector = config?.connectors?.find((c) => c.type === 'injected' || c.id === 'injected')
    if (!config || !connector) throw new Error('Wallet connector is not ready. Reload and try again.')
    const { connect: wagmiConnect } = await import('wagmi/actions')
    await wagmiConnect(config, { connector })
  }

  const connect = useCallback(async () => {
    if (runningRef.current) return false
    runningRef.current = true
    setBusy(true)
    setStatus('connecting')
    setError(null)
    let addr
    try {
      // 1. Reuse an existing authorized session without prompting. On mobile
      //    this is the difference between connecting instantly and hitting a
      //    wallet-side auto-decline because another request is still open.
      //    A silent wallet session is not a hub session: only skip the
      //    interactive flow when the hub already knows this address.
      addr = await detectSilentSession()
      if (addr) {
        try {
          const hubAddr = await getSessionAddress({ authBase })
          if (!hubAddr || hubAddr.toLowerCase() !== String(addr).toLowerCase()) addr = null
        } catch {
          addr = null
        }
      }
      if (addr) {
        setStatus('signed-in')
        return true
      }

      // 2. Interactive: modern wallets get the modal, legacy-only setups
      //    (window.ethereum, zero EIP-6963 announcements) connect directly
      //    since the modal has no row for them. Either way the hook drives
      //    SIWE explicitly afterwards (AppKit one-click does not fire for
      //    injected EOAs in 1.8.21 — verified live).
      {
        let announced = 0
        try {
          announced = await countAnnouncedProviders()
        } catch {
          announced = 0
        }
        if (announced === 0 && typeof window !== 'undefined' && window.ethereum) {
          await connectLegacyDirect()
        } else {
          try {
            await open()
          } catch {
            // modal open can race account sync; waitForWallet keeps polling.
          }
        }
        addr = await waitForWallet()
      }

      // 3. AppKit reconciled but useAppKitAccount may still be settling; one
      //    bounded poll before surfacing an error.
      if (!addr) addr = await waitForWallet(8000)

      if (!addr) {
        setStatus('error')
        setError('Wallet did not connect. If your wallet is already connected to another app, disconnect it there first, then approve the connection here.')
        return false
      }
      await sign(addr)
      return true
    } catch (err) {
      if (err?.code === 'ACCOUNT_MISMATCH') {
        setStatus('idle')
        setError(err.message)
      } else if (isWalletRejection(err)) {
        // A rejection is a normal outcome, not a fault: the user closed the
        // prompt. Silently returning to idle left people tapping again with no
        // idea why, so say what happened and invite one clean retry.
        setStatus('idle')
        setError('Connection cancelled. Tap Connect when you\'re ready.')
      } else {
        setError(getWalletErrorMessage(err))
        setStatus('error')
      }
      return false
    } finally {
      setBusy(false)
      runningRef.current = false
    }
  }, [open, address, walletProvider, authBase, noncePath, verifyPath])

  // Full sign-out: revoke the hub session server-side, disconnect the
  // wallet, reset to idle. Cookie-only logout leaves a live wallet session
  // behind (and vice versa) — the reference implementations do all three.
  const signOut = useCallback(async () => {
    setBusy(true)
    try {
      try {
        await fetch(`${authBase}/auth/logout`, { method: 'POST', credentials: 'include' })
      } catch {}
      try {
        const { getNibgateWagmiConfig } = await import('./appkit.js')
        const config = getNibgateWagmiConfig()
        if (config) {
          const { disconnect } = await import('wagmi/actions')
          await disconnect(config).catch(() => {})
        }
      } catch {}
      try {
        window.dispatchEvent(new Event(HUB_SESSION_CLEARED_EVENT))
      } catch {}
    } finally {
      setStatus('idle')
      setError(null)
      setBusy(false)
    }
    return true
  }, [authBase])

  // Authed fetch: hub calls through one door. A 401 means the cookie session
  // died (expiry, logout elsewhere, cleared cookies) — flip to the expired
  // state instead of leaking raw 401s into app logic. Never auto-signs.
  const authedFetch = useCallback(async (url, init) => {
    const res = await fetch(url, { credentials: 'include', ...(init || {}) })
    if (res && res.status === 401) notifySessionExpired()
    return res
  }, [notifySessionExpired])

  return { connect, signIn, signOut, authedFetch, busy, status, error, address, clearError, chainId, notifySessionExpired }
}
