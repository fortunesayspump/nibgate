'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit, useAppKitState, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { getWalletErrorMessage, isWalletRejection } from '../errors.js'
import { ensureWalletAuthorized } from './authorize.js'
import { signInWithSiwe, signMessageWithProvider } from './siwe.js'
import { HUB_SESSION_UPDATED_EVENT } from './session.js'

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

  const clearError = useCallback(() => setError(null), [])

  async function waitForWallet(timeoutMs = 30000) {
    const started = Date.now()
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

  async function sign(addr) {
    await ensureWalletAuthorized(addr, { walletProvider, appKitAccount: { address: addr } })
    setStatus('signing')
    await signInWithSiwe(addr, (message) => signMessageWithProvider(walletProvider, addr, message), { authBase, noncePath, verifyPath })
    setStatus('signed-in')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(HUB_SESSION_UPDATED_EVENT))
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
      if (isWalletRejection(err)) {
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
      addr = await detectSilentSession()

      // 2. Only escalate to the modal if there is nothing to reuse.
      if (!addr) {
        try {
          await open()
        } catch {
          // modal open can race account sync; waitForWallet keeps polling.
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
      if (isWalletRejection(err)) {
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

  return { connect, signIn, busy, status, error, address, clearError }
}
