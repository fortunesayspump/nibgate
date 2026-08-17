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
    while (Date.now() - started < timeoutMs) {
      if (isConnectedRef.current && addressRef.current) {
        return addressRef.current
      }
      if (modalOpenRef.current) {
        sawModalOpen = true
      } else if (sawModalOpen && !connectingWalletRef.current) {
        return undefined
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
    try {
      await open()
      const addr = await waitForWallet()
      if (!addr) {
        setStatus('idle')
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
