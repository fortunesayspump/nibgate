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
  const [visible, setVisible] = useState(false)
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
  // Keep it out of the page flow (it used to be a full-width bar at the very
  // top). A floating toast fades away on its own so a stale network warning
  // never sits above the app; the user can still act before it disappears.
  useEffect(() => {
    if (!error && !message) { setVisible(false); return }
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), error ? 12000 : 5000)
    return () => clearTimeout(timer)
  }, [error, message])

  if (!isConnected || !address || (!error && !message) || !visible) return null
  return (
    <div role={error ? 'alert' : 'status'} style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 60, maxWidth: 360,
      padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border, #ddd)',
      background: 'var(--surface, #fff)', color: 'inherit', boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
      fontSize: 13, lineHeight: 1.5, textAlign: 'left',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ flex: 1 }}>{error?.message || message}</span>
        <button type="button" aria-label="Dismiss" onClick={() => setVisible(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
      </div>
      {error && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => check(false)}>{busy ? 'Checking…' : 'Check again'}</button>
          {error?.canRepair && <button type="button" disabled={busy} onClick={() => check(true)}>Repair wallet connection</button>}
        </div>
      )}
    </div>
  )
}
