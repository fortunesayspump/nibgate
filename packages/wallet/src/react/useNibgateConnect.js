'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useAppKit, useAppKitState } from '@reown/appkit/react'
import { getWalletErrorMessage, isWalletRejection } from '../errors.js'
import { ensureWalletAuthorized } from './authorize.js'
import { signInWithSiwe } from './siwe.js'
import { HUB_SESSION_UPDATED_EVENT } from './session.js'

export function useNibgateConnect(options = {}) {
  const { authBase = '', noncePath, verifyPath } = options
  const { isConnected, address, connector } = useAccount()
  const { open } = useAppKit()
  const { open: modalOpen, connectingWallet } = useAppKitState()
  const { signMessageAsync } = useSignMessage()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const isConnectedRef = useRef(isConnected)
  const addressRef = useRef(address)
  const runningRef = useRef(false)
  const modalOpenRef = useRef(modalOpen)
  const connectingWalletRef = useRef(connectingWallet)
  useEffect(() => {
    isConnectedRef.current = isConnected
  }, [isConnected])
  useEffect(() => {
    addressRef.current = address
  }, [address])
  useEffect(() => {
    modalOpenRef.current = modalOpen
  }, [modalOpen])
  useEffect(() => {
    connectingWalletRef.current = connectingWallet
  }, [connectingWallet])

  useEffect(() => {
    if (isConnected) setError(null)
  }, [isConnected])

  async function waitForWallet(timeoutMs = 30000) {
    const started = Date.now()
    let sawModalOpen = false
    let modalClosedAt = 0
    const GRACE_MS = 6000 // after AppKit modal closes, give wagmi's adapter a moment to reconcile isConnected/address before bailing
    while (Date.now() - started < timeoutMs) {
      if (isConnectedRef.current && addressRef.current) {
        return addressRef.current
      }
      if (modalOpenRef.current) {
        sawModalOpen = true
        modalClosedAt = 0
      } else if (sawModalOpen && !connectingWalletRef.current) {
        // AppKit reported a wallet choice and stopped spinning, but wagmi's
        // useAccount (synced via the WagmiAdapter) may not have reconciled
        // isConnected/address yet. Wait the grace window before giving up.
        if (modalClosedAt === 0) modalClosedAt = Date.now()
        if (Date.now() - modalClosedAt >= GRACE_MS) return undefined
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return undefined
  }

  async function sign(address) {
    await ensureWalletAuthorized(connector)
    await signInWithSiwe(address, (message) => signMessageAsync({ message }), { authBase, noncePath, verifyPath })
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
        setError(err instanceof Error ? err.message : getWalletErrorMessage(err))
        setStatus('error')
      }
      return false
    } finally {
      setBusy(false)
      runningRef.current = false
    }
  }, [signMessageAsync, authBase, noncePath, verifyPath, connector])

  const connect = useCallback(async () => {
    if (runningRef.current) return false
    runningRef.current = true
    setBusy(true)
    setStatus('connecting')
    setError(null)
    let addr
    let attempt = 0
    try {
      // AppKit's `open()` resolves as soon as the modal shows, but the wallet
      // selection + wagmi reconciliation (via the AppKit WagmiAdapter) is async.
      // If the first pass doesn't reconcile an address (common after a full
      // cache+permission clear on Chrome/MetaMask), retry once before failing
      // so users aren't left watching "Processing…" revert to "Connect wallet"
      // with no explanation.
      while (attempt < 2) {
        attempt += 1
        try {
          await open()
        } catch (e) { /* modal open failures are retried below by waitForWallet */ }
        addr = await waitForWallet()
        if (addr) break
      }
      if (!addr) {
        setStatus('error')
        setError('Wallet did not connect. Make sure you approved the MetaMask connection for this site (check the MetaMask popup), then try again.')
        return false
      }
      setStatus('signing')
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
  }, [open, signMessageAsync, authBase, noncePath, verifyPath, connector])

  return { connect, signIn, busy, status, error }
}
