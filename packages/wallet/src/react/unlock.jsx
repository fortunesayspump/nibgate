'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useDisconnect, useSignMessage, useSignTypedData, useSwitchChain } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { getWalletErrorMessage, isWalletRejection } from '../errors.js'
import { ensureWalletAuthorized } from './authorize.js'
import { ARC_TESTNET, isArcNetwork } from '../chain.js'
import { signInWithSiwe } from './siwe.js'
import { HUB_SESSION_UPDATED_EVENT } from './session.js'
import unlockKeyAnimation from '../unlock-key.js'
import { GatewayWalletUI } from './gateway-wallet.jsx'

const NETWORK = 'eip155:5042002'
const PROOF_PREFIX = 'nibgate:payment-proof:'

function storedProof(id) {
  try {
    return localStorage.getItem(`${PROOF_PREFIX}${id}`) || ''
  } catch {
    return ''
  }
}

function waitForChain(check, timeoutMs = 8000) {
  const started = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      if (check() || Date.now() - started > timeoutMs) resolve()
      else setTimeout(tick, 100)
    }
    tick()
  })
}

export function useNibgateUnlock({ resource, accessPath, gatewayBalanceUrl, onUnlock, authBase = '', noncePath = '', verifyPath = '' }) {
  const { isConnected, address, chain, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useAppKit()
  const { switchChainAsync } = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()
  const { signMessageAsync } = useSignMessage()

  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(null)
  const [unlocked, setUnlocked] = useState(false)
  const [payload, setPayload] = useState(null)
  const [proof, setProof] = useState('')
  const [gatewayBalance, setGatewayBalance] = useState('')

  const runningRef = useRef(false)
  const isConnectedRef = useRef(isConnected)
  const addressRef = useRef(address)
  const chainRef = useRef(chain)
  const onUnlockRef = useRef(onUnlock)

  useEffect(() => { isConnectedRef.current = isConnected }, [isConnected])
  useEffect(() => { addressRef.current = address }, [address])
  useEffect(() => { chainRef.current = chain }, [chain])
  useEffect(() => { onUnlockRef.current = onUnlock }, [onUnlock])

  const refreshGatewayBalance = useCallback(async () => {
    if (!gatewayBalanceUrl || !addressRef.current) return ''
    try {
      const res = await fetch(gatewayBalanceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressRef.current }),
      })
      const data = await res.json().catch(() => ({}))
      setGatewayBalance(data?.balance ?? '')
      return data?.balance ?? ''
    } catch {
      setGatewayBalance('')
      return ''
    }
  }, [gatewayBalanceUrl])

  useEffect(() => {
    if (!gatewayBalanceUrl) return
    refreshGatewayBalance()
    const t = setInterval(refreshGatewayBalance, 15000)
    return () => clearInterval(t)
  }, [gatewayBalanceUrl, refreshGatewayBalance, address])

  const checkout = useCallback(async (input) => {
    const account = addressRef.current
    if (!account) throw new Error('Connect your wallet to continue.')
    const recipient = String(resource.recipient || input?.challenge?.accepts?.[0]?.recipient || '').toLowerCase()
    if (recipient && recipient === String(account).toLowerCase()) {
      return { self: true, address: account }
    }
    if (!isArcNetwork(chainRef.current?.id)) {
      await switchChainAsync({ chainId: ARC_TESTNET.id })
      await waitForChain(() => isArcNetwork(chainRef.current?.id))
    }
    const { createCircleGatewayBrowserAdapter } = await import('@nibgate/sdk')
    await ensureWalletAuthorized(connector)
    const adapter = await createCircleGatewayBrowserAdapter({
      network: NETWORK,
      signer: {
        address: account,
        signTypedData: async (typedData) =>
          signTypedDataAsync({
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          }),
      },
    })
    return adapter.pay(input)
  }, [resource, switchChainAsync, signTypedDataAsync, connector])

  async function waitForWallet(timeoutMs = 30000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (isConnectedRef.current && addressRef.current) return addressRef.current
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return undefined
  }

  const siweEnabledRef = useRef(Boolean(authBase || noncePath || verifyPath))
  const signInRef = useRef(async () => {})

  // The backend mints the x402 challenge (amount = payer's whitelist tier)
  // before the wallet signs, so it must know WHO is asking. Old backends
  // simply ignore the extra query param.
  const accessPathFor = useCallback((path) => {
    const w = addressRef.current
    if (!w || !path) return path
    return `${path}${path.includes('?') ? '&' : '?'}wallet=${encodeURIComponent(w)}`
  }, [])

  const signInIfEnabled = useCallback(async () => {
    if (!siweEnabledRef.current) return
    const addr = addressRef.current
    if (!addr) return
    try {
      await ensureWalletAuthorized(connector)
      await signInWithSiwe(addr, (message) => signMessageAsync({ message }), { authBase, noncePath, verifyPath })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(HUB_SESSION_UPDATED_EVENT, { detail: { address: addr } }))
      }
    } catch (err) {
      if (isWalletRejection(err)) return
      setError(err?.message || 'Sign-in failed.')
    }
  }, [authBase, noncePath, verifyPath, signMessageAsync, connector])

  useEffect(() => { signInRef.current = signInIfEnabled }, [signInIfEnabled])

  const connect = useCallback(async () => {
    if (runningRef.current) return false
    runningRef.current = true
    setBusy(true)
    setError(null)
    try {
      await open()
      const addr = await waitForWallet()
      if (addr) await signInRef.current()
      return Boolean(addr)
    } catch {
      return false
    } finally {
      setBusy(false)
      runningRef.current = false
    }
  }, [open])

  const unlock = useCallback(async () => {
    if (runningRef.current) return false
    runningRef.current = true
    setBusy(true)
    setError(null)
    setStatus('Checking access...')
    try {
      if (!addressRef.current) {
        setStatus('Connect your wallet to continue.')
        await open()
        const addr = await waitForWallet()
        if (!addr) {
          setStatus('')
          return false
        }
        await signInRef.current()
      }
      const { checkResourceAccess } = await import('@nibgate/sdk')
      const result = await checkResourceAccess(resource, {
        accessPath: accessPathFor(accessPath),
        paymentProvider: 'circle-gateway-browser',
        challengeMessage: 'Payment required. Approve the Gateway payment in your wallet...',
        paymentMessage: 'Waiting for wallet approval...',
        successMessage: 'Unlocked.',
        checkout,
        onStatus: setStatus,
      })
      if (result.ok) {
        const nextProof = result.payload?.unlockProof || storedProof(resource.id)
        try { if (result.payload?.unlockProof) localStorage.setItem(`${PROOF_PREFIX}${resource.id}`, result.payload.unlockProof) } catch {}
        setPayload(result.payload)
        setProof(nextProof)
        setUnlocked(true)
        setStatus('')
        onUnlockRef.current?.(result)
        return true
      }
      setError(result.error || 'Could not unlock.')
      setStatus('')
      return false
    } catch (err) {
      const message = isWalletRejection(err) ? 'Request cancelled.' : getWalletErrorMessage(err) || 'Unlock failed.'
      setError(message)
      setStatus('')
      return false
    } finally {
      setBusy(false)
      runningRef.current = false
    }
  }, [resource, accessPath, accessPathFor, checkout, open])

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(`${PROOF_PREFIX}${resource.id}`)
    } catch {}
    setUnlocked(false)
    setPayload(null)
    setProof('')
    setError(null)
    setStatus('')
  }, [resource.id])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const existingProof = storedProof(resource.id)
      if (!existingProof) {
        if (!cancelled) setChecking(false)
        return
      }
      try {
        const res = await fetch(accessPathFor(accessPath), {
          headers: { accept: 'application/json', 'x-nibgate-payment-proof': existingProof },
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && data?.ok) {
          const nextProof = data?.unlockProof && data.unlockProof !== existingProof ? data.unlockProof : existingProof
          try { localStorage.setItem(`${PROOF_PREFIX}${resource.id}`, nextProof) } catch {}
          setPayload(data)
          setProof(nextProof)
          setUnlocked(true)
          onUnlockRef.current?.({ ok: true, payload: data, resource })
        }
      } catch {}
      if (!cancelled) setChecking(false)
    }
    init()
    return () => { cancelled = true }
  }, [resource.id, accessPath, accessPathFor])

  return { busy, checking, status, error, unlocked, payload, proof, address, connect, disconnect, unlock, clear, gatewayBalance, refreshGatewayBalance }
}

const HOLD_MS = 1500

function shortAddress(a) {
  if (!a) return ''
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

const DepositIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle' }} aria-hidden="true">
    <path d="M12 17V3" />
    <path d="m6 11 6 6 6-6" />
    <path d="M19 21H5" />
  </svg>
)

const labelButtonStyle = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  color: 'inherit',
  padding: 0,
  margin: 0,
}

export function NibgateUnlockUI({ resource, busy, checking, status, error, address, disconnect, unlock, connect, gatewayBalance, gatewayBalanceUrl }) {
  const lottieRef = useRef(null)
  const [holdPct, setHoldPct] = useState(0)
  const [holdTransition, setHoldTransition] = useState('none')
  const [showGateway, setShowGateway] = useState(false)
  const holdRef = useRef({ timer: null, active: false, complete: false })
  const isBusy = busy || checking
  const isConnected = Boolean(address)
  const price = resource.price && resource.price !== '0'
    ? `${resource.price} ${resource.currency || 'USDC'}`
    : 'free'
  const isFree = !resource.price || String(resource.price).trim() === '0' || String(resource.price).trim() === ''

  useEffect(() => {
    let cancelled = false
    let anim = null
    import('lottie-web')
      .then((mod) => {
        if (cancelled || !lottieRef.current) return
        anim = mod.default.loadAnimation({
          container: lottieRef.current,
          animationData: unlockKeyAnimation,
          loop: true,
          autoplay: true,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (anim) anim.destroy()
    }
  }, [])

  useEffect(() => () => { if (holdRef.current.timer) clearTimeout(holdRef.current.timer) }, [])

  const startHold = (e) => {
    e?.preventDefault()
    if (isFree) {
      unlock()
      return
    }
    if (holdRef.current.active || isBusy || !isConnected) return
    holdRef.current.active = true
    holdRef.current.complete = false
    setHoldPct(0)
    setHoldTransition('none')
    requestAnimationFrame(() => {
      setHoldTransition(`width ${HOLD_MS}ms linear`)
      setHoldPct(100)
    })
    holdRef.current.timer = setTimeout(() => {
      holdRef.current.complete = true
      holdRef.current.active = false
      setHoldTransition('none')
      setHoldPct(0)
      unlock()
    }, HOLD_MS)
  }

  const cancelHold = () => {
    if (!holdRef.current.active || holdRef.current.complete) return
    clearTimeout(holdRef.current.timer)
    holdRef.current.timer = null
    holdRef.current.active = false
    setHoldTransition('none')
    setHoldPct(0)
  }

  const buttonText = checking ? 'Checking…' : busy ? 'Processing…' : isFree ? 'Unlock for free' : 'Hold to pay'
  const disabled = isBusy || !isConnected

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 580,
        margin: '0 auto',
        padding: 'clamp(32px, 8vw, 52px)',
        fontFamily: 'var(--font-content, inherit)',
        color: 'var(--fg, #0a0a0a)',
      }}
    >
      <div
        ref={lottieRef}
        style={{ width: 165, height: 168, marginBottom: 24 }}
        aria-hidden="true"
      />
      <div style={{ fontSize: 50, fontWeight: 700, letterSpacing: '-.03em', marginBottom: 12 }}>
        {price}
      </div>
      <div style={{ fontSize: 21, color: 'var(--muted, #6b6862)', marginBottom: 48 }}>
        Pay to unlock this content
      </div>
      <div
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 'clamp(15px, 4.2vw, 18px)',
          color: 'var(--muted, #6b6862)',
          marginBottom: 40,
          minHeight: 28,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          rowGap: 8,
          maxWidth: '100%',
        }}
      >
        {isConnected ? (
          <>
            <span>{shortAddress(address)}</span>
            <button type="button" style={{ ...labelButtonStyle, cursor: 'pointer' }} onClick={() => disconnect?.()}>
              · Disconnect
            </button>
            <button
              type="button"
              style={{ ...labelButtonStyle, cursor: 'pointer', color: 'var(--accent, #7c9a6d)', whiteSpace: 'nowrap' }}
              onClick={() => setShowGateway(true)}
            >
              · {gatewayBalance} <DepositIcon />
            </button>
          </>
        ) : (
          <button type="button" style={{ ...labelButtonStyle, cursor: isBusy ? 'default' : 'pointer' }} disabled={isBusy} onClick={() => connect()}>
            Connect wallet
          </button>
        )}
      </div>
      <div
        style={{ width: '100%', position: 'relative', borderRadius: 10, cursor: disabled ? 'default' : 'pointer' }}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          type="button"
          disabled={disabled}
          style={{
            width: '100%',
            padding: '14px 0',
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1,
            border: 0,
            borderRadius: 10,
            outline: 'none',
            cursor: disabled ? 'default' : 'pointer',
            position: 'relative',
            overflow: 'hidden',
            color: '#fff',
            background: 'var(--accent, #7c9a6d)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            transition: 'transform .1s, box-shadow .1s',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${holdPct}%`,
              background: 'rgba(255,255,255,0.55)',
              borderRadius: 10,
              transition: holdTransition,
            }}
          />
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            {buttonText}
          </span>
        </button>
      </div>
      {status && <div style={{ textAlign: 'center', marginTop: 16, fontSize: 18, color: 'var(--muted, #6b6862)', minHeight: 28 }}>{status}</div>}
      {error && <div style={{ textAlign: 'center', marginTop: 16, fontSize: 18, color: '#dc2626', minHeight: 28 }}>{error}</div>}
      {showGateway && address && (
        <GatewayWalletUI
          address={address}
          gatewayBalanceUrl={gatewayBalanceUrl}
          onClose={() => setShowGateway(false)}
        />
      )}
    </div>
  )
}

export function NibgateUnlock({ resource, accessPath, gatewayBalanceUrl, onUnlock, children, authBase = '', noncePath = '', verifyPath = '' }) {
  const state = useNibgateUnlock({ resource, accessPath, gatewayBalanceUrl, onUnlock, authBase, noncePath, verifyPath })
  if (state.unlocked) {
    if (typeof children === 'function') return children(state)
    return children
  }
  return <NibgateUnlockUI {...state} resource={resource} gatewayBalanceUrl={gatewayBalanceUrl} />
}
