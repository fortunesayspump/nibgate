'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppKitAccount, useAppKitNetwork, useAppKitProvider } from '@reown/appkit/react'
import { ArcConnectionError, checkArcConnection, repairArcNetwork } from '../network.js'

// One passive check per connected selection. No add/switch request is made by
// this effect; only the explicit repair button can change wallet settings.
export function ArcConnectionNotice() {
  const { address, isConnected } = useAppKitAccount()
  const { chainId } = useAppKitNetwork()
  const { walletProvider } = useAppKitProvider('eip155')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const selected = useRef(null)
  const mounted = useRef(false)
  const lifecycle = useRef(0)
  const lock = useRef(false)
  const previous = selected.current
  if (!previous || previous.provider !== walletProvider || previous.address !== address || previous.connected !== isConnected) {
    selected.current = { provider: walletProvider, address, connected: isConnected }
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; lifecycle.current += 1 }
  }, [])
  useEffect(() => {
    let cancelled = false
    const snapshot = selected.current
    setError(null)
    setMessage('')
    if (!isConnected || !address || !walletProvider?.request) return
    checkArcConnection(walletProvider).catch((failure) => {
      if (!cancelled && selected.current === snapshot && failure instanceof ArcConnectionError) setError(failure)
    })
    return () => { cancelled = true }
  }, [walletProvider, address, chainId, isConnected])

  async function check(repair) {
    if (lock.current || !walletProvider?.request || !isConnected) return
    const snapshot = selected.current
    const revision = lifecycle.current
    // A retained handler must not capture a new selection while still using
    // its old render's provider/account closure.
    const isCurrent = () => mounted.current && lifecycle.current === revision && selected.current === snapshot &&
      snapshot?.provider === walletProvider && snapshot.address === address && snapshot.connected === isConnected
    if (!isCurrent()) return
    lock.current = true
    setBusy(true)
    const assertActive = () => {
      if (!isCurrent()) throw new ArcConnectionError('changed')
    }
    try {
      assertActive()
      if (repair) await repairArcNetwork(walletProvider, { assertActive })
      else await checkArcConnection(walletProvider)
      assertActive()
      setError(null)
      setMessage('Wallet connection responds. No payment was sent by this check.')
    } catch (failure) {
      if (isCurrent()) {
        setMessage('')
        setError(failure instanceof ArcConnectionError ? failure : new ArcConnectionError('unavailable'))
      }
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }
  if (!isConnected || !address || (!error && !message)) return null
  return (
    <div role="status" style={{ padding: '10px 16px', fontSize: 13, lineHeight: 1.5, borderBottom: '1px solid var(--border, #ddd)' }}>
      <span>{error?.message || message}</span>{' '}
      {error && <button type="button" disabled={busy} onClick={() => check(false)}>{busy ? 'Checking…' : 'Check again'}</button>}{' '}
      {error?.canRepair && <button type="button" disabled={busy} onClick={() => check(true)}>Repair wallet connection</button>}
    </div>
  )
}
