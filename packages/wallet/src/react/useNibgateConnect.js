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
    const GRACE_MS = 6000 // after AppKit's modal closes, give the WagmiAdapter a moment to reconcile
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
        setStatus('idle')
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

  const connect = useCallback(async () => {
    if (runningRef.current) return false
    runningRef.current = true
    setBusy(true)
    setStatus('connecting')
    setError(null)
    let addr
    let attempt = 0
    try {
      // AppKit's open() shows the modal; selecting a wallet triggers AppKit to
      // reconcile the account into useAppKitAccount (synced by the WagmiAdapter).
      // Poll for the address; if the first pass doesn't resolve (e.g. after a
      // full cache+permission clear), retry once before erroring.
      while (attempt < 2) {
        attempt += 1
        try {
          await open()
        } catch {
          // modal open can race account sync; waitForWallet keeps polling.
        }
        addr = await waitForWallet()
        if (addr) break
      }
      if (!addr) {
        setStatus('error')
        setError('Wallet did not connect. Approve the MetaMask connection for this site, then try again.')
        return false
      }
      await sign(addr)
      return true
    } catch (err) {
      if (isWalletRejection(err)) {
        setStatus('idle')
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
