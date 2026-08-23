'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { encodeFunctionData, createWalletClient, custom } from 'viem'
import { useAppKit, useAppKitProvider, useAppKitAccount, useAppKitNetwork, useDisconnect } from '@reown/appkit/react'
import { getWalletErrorMessage, getPaymentErrorMessage, isWalletRejection } from '../errors.js'
import { ensureWalletAuthorized } from './authorize.js'
import { ARC_TESTNET, isArcNetwork } from '../chain.js'
import { ensureArcNetwork } from '../network.js'
import { signInWithSiwe, signMessageWithProvider } from './siwe.js'
import { ownershipMessage } from '@nibgate/sdk'
import { HUB_SESSION_UPDATED_EVENT } from './session.js'
import unlockKeyAnimation from '../unlock-key.js'
import { GatewayWalletUI } from './gateway-wallet.jsx'

const NETWORK = 'eip155:5042002'
const PROOF_PREFIX = 'nibgate:payment-proof:'
const USDC = '0x3600000000000000000000000000000000000000'
const ARC_RPC = 'https://rpc.testnet.arc.io'
const BALANCE_OF = '0x70a08231'
const USDC_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
]

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
  // Source the wallet session from AppKit (useAppKitAccount + the AppKit wallet
  // provider) instead of wagmi's useAccount/useSignMessage/useSendTransaction.
  // wagmi's connector reconciliation lags AppKit's, and calling its
  // signMessageAsync/sendTransactionAsync/signTypedDataAsync while the wagmi
  // `connector` is null throws "Connector not connected" — which is exactly
  // what users hit connecting on a fresh cache. Signing/sending through the
  // AppKit EIP-1193 provider (mirroring @nibgate/nibgate evm-gateway.js) removes
  // the wagmi dependency entirely from this flow.
  const appKitAccount = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('eip155')
  const { disconnect } = useDisconnect()
  const { open } = useAppKit()
  // useAppKitAccount has no chainId — the current network (CAIP chain id like
  // `eip155:5042002`) comes from useAppKitNetwork.
  const { chainId } = useAppKitNetwork()
  const address = appKitAccount.address ? `0x${String(appKitAccount.address).replace(/^0x/, '')}` : null
  const isConnected = Boolean(appKitAccount.isConnected) || Boolean(address)

  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(null)
  const [unlocked, setUnlocked] = useState(false)
  const [payload, setPayload] = useState(null)
  const [proof, setProof] = useState('')
  const [gatewayBalance, setGatewayBalance] = useState('')
  const [walletBalance, setWalletBalance] = useState('')
  const [paymentRail, setPaymentRail] = useState(resource.paymentRail === 'transfer' ? 'transfer' : 'gateway')

  const runningRef = useRef(false)
  const addressRef = useRef(address)
  // Tracks whether THIS session ever saw a connected wallet, so the
  // disconnect cleanup below only fires on a real connected->disconnected
  // transition — not on the initial mount of a page load, where isConnected
  // starts false and wiping would destroy a returning user's stored proof
  // before the wallet has had a chance to reconnect.
  const everConnectedRef = useRef(false)
  const chainIdRef = useRef(chainId)
  const isConnectedRef = useRef(isConnected)
  const onUnlockRef = useRef(onUnlock)
  const railRef = useRef(paymentRail)
  const walletProviderRef = useRef(walletProvider)

  useEffect(() => { addressRef.current = address }, [address])
  useEffect(() => { chainIdRef.current = chainId }, [chainId])
  useEffect(() => { isConnectedRef.current = isConnected }, [isConnected])
  useEffect(() => { onUnlockRef.current = onUnlock }, [onUnlock])
  useEffect(() => { railRef.current = paymentRail }, [paymentRail])
  useEffect(() => { walletProviderRef.current = walletProvider }, [walletProvider])

  // Switching rails must clear any stuck unlock attempt (e.g. a hung gateway
  // flow that never resolves), otherwise the next rail short-circuits on
  // runningRef and can never pay.
  const switchRail = useCallback((next) => {
    runningRef.current = false
    setBusy(false)
    setPaymentRail(next)
  }, [])

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

  const refreshWalletBalance = useCallback(async () => {
    const addr = addressRef.current
    if (!addr) {
      setWalletBalance('')
      return ''
    }
    try {
      const res = await fetch(ARC_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC, data: BALANCE_OF + addr.slice(2).padStart(64, '0') }, 'latest'],
          id: 1,
        }),
      })
      const data = await res.json()
      const bal = data?.result ? parseInt(data.result, 16) / 1e6 : 0
      const label = bal.toFixed(2) + ' USDC'
      setWalletBalance(label)
      return label
    } catch {
      setWalletBalance('')
      return ''
    }
  }, [])

  useEffect(() => {
    if (paymentRail !== 'transfer') return
    refreshWalletBalance()
    const t = setInterval(refreshWalletBalance, 15000)
    return () => clearInterval(t)
  }, [paymentRail, refreshWalletBalance, address])

  const checkout = useCallback(async (input) => {
    const account = addressRef.current
    if (!account) throw new Error('Connect your wallet to continue.')
    const recipient = String(resource.recipient || input?.challenge?.accepts?.[0]?.recipient || '').toLowerCase()
    if (recipient && recipient === String(account).toLowerCase()) {
      return { self: true, address: account }
    }
    const provider = walletProviderRef.current
    if (!provider || typeof provider.request !== 'function') {
      throw new Error('Wallet provider is not available. Connect your wallet to continue.')
    }
    // Ensure Arc Testnet is active before signing/sending (MetaMask error 4100 /
    // wrong-chain rejects otherwise). Uses the EIP-1193 provider directly.
    const currentChainId = await (async () => {
      try {
        const hex = await provider.request({ method: 'eth_chainId' })
        return typeof hex === 'string' ? Number(hex) : Number(hex)
      } catch { return undefined }
    })()
    if (currentChainId === undefined || !isArcNetwork(currentChainId)) {
      await ensureArcNetwork(provider, { currentChainId })
      await waitForChain(() => isArcNetwork(chainIdRef.current))
    }
    const rail = input?.challenge?.paymentRail || railRef.current || resource.paymentRail || 'gateway'
    const walletClient = createWalletClient({ chain: ARC_TESTNET, account: account, transport: custom(provider) })
    if (rail === 'transfer') {
      const payTo = String(input?.challenge?.accepts?.[0]?.payTo || input?.challenge?.accepts?.[0]?.recipient || resource.payTo || resource.recipient || '')
      if (!payTo) throw new Error('No recipient address in the transfer challenge.')
      const amount = Number(input?.challenge?.accepts?.[0]?.amount || resource.price || 0)
      if (!(amount > 0)) throw new Error('Invalid payment amount.')
      const amountUsdc = BigInt(Math.round(amount * 1e6))
      const data = encodeFunctionData({ abi: USDC_TRANSFER_ABI, functionName: 'transfer', args: [payTo, amountUsdc] })
      const tx = await walletClient.sendTransaction({ to: USDC, data, chain: ARC_TESTNET, account: account })
      const txHash = tx?.hash || tx || ''
      return {
        paymentSignature: txHash,
        metadata: {
          paymentProvider: 'direct-transfer',
          paymentId: txHash,
          txHash,
          recipient: payTo,
          amount,
          currency: 'USDC',
          network: NETWORK,
        },
      }
    }
    const { createCircleGatewayBrowserAdapter } = await import('@nibgate/sdk')
    await ensureWalletAuthorized(account, { walletProvider: provider })
    const adapter = await createCircleGatewayBrowserAdapter({
      network: NETWORK,
      signer: {
        address: account,
        signTypedData: async (typedData) => {
          // viem's signTypedData handles EIP-712 encoding across wallets. Using
          // the AppKit provider (via a wallet client) avoids wagmi's
          // signTypedDataAsync throwing "Connector not connected".
          return walletClient.signTypedData({
            account: account,
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          })
        },
      },
    })
    return adapter.pay(input)
  }, [resource])

  // Poll AppKit's account state (synced by its AppKit connector) until an
  // address lands, giving a grace window after the modal closes for the reconcile.
  async function waitForWallet(timeoutMs = 30000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const addr = addressRef.current
      if (addr) return addr
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return null
  }

  const siweEnabledRef = useRef(Boolean(authBase || noncePath || verifyPath))
  const signInRef = useRef(async () => {})

  // The backend mints the x402 challenge (amount = payer's whitelist tier)
  // before the wallet signs, so it must know WHO is asking. Old backends
  // simply ignore the extra query param.
  const accessPathFor = useCallback((path) => {
    const w = addressRef.current
    const rail = railRef.current || resource.paymentRail || 'gateway'
    if (!path) return path
    const base = `${path}${path.includes('?') ? '&' : '?'}rail=${encodeURIComponent(rail)}`
    if (!w) return base
    return `${base}&wallet=${encodeURIComponent(w)}`
  }, [resource.paymentRail])

  const signInIfEnabled = useCallback(async () => {
    if (!siweEnabledRef.current) return
    const addr = addressRef.current
    if (!addr) return
    const provider = walletProviderRef.current
    if (!provider || typeof provider.request !== 'function') return
    try {
      await ensureWalletAuthorized(addr, { walletProvider: provider })
      // personal_sign via the AppKit EIP-1193 provider (same proven path as
      // useNibgateConnect.js). wagmi's signMessageAsync throws
      // "Connector not connected" when its connector hasn't reconciled.
      await signInWithSiwe(addr, (message) => signMessageWithProvider(provider, addr, message), { authBase, noncePath, verifyPath })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(HUB_SESSION_UPDATED_EVENT, { detail: { address: addr } }))
      }
    } catch (err) {
      if (isWalletRejection(err)) return
      setError(err?.message || 'Sign-in failed.')
    }
  }, [authBase, noncePath, verifyPath])

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
      } else {
        // Ensure a SIWE session exists even for an already-connected wallet so
        // free / whitelist-free unlocks are granted instead of 402ing with no
        // session (finding #2). No-op when SIWE isn't configured.
        await signInRef.current()
      }
      const { checkResourceAccess } = await import('@nibgate/sdk')
      const rail = railRef.current || resource.paymentRail || 'gateway'
      const result = await checkResourceAccess(resource, {
        accessPath: accessPathFor(accessPath),
        paymentProvider: rail === 'transfer' ? 'direct-transfer-browser' : 'circle-gateway-browser',
        challengeMessage: rail === 'transfer'
          ? 'Payment required. Send USDC to the recipient in your wallet...'
          : 'Payment required. Approve the Gateway payment in your wallet...',
        paymentMessage: 'Waiting for wallet approval...',
        successMessage: 'Unlocked.',
        checkout,
        // Pre-checkout ownership probe: when the server says this wallet
        // already owns the resource, ask for one personal_sign to prove
        // possession — a verified signer unlocks free (no re-charge).
        proveOwnership: !addressRef.current ? undefined : async ({ resource: ownershipResource }) => {
          const provider = walletProviderRef.current
          if (!provider || typeof provider.request !== 'function') return null
          const message = ownershipMessage(ownershipResource, addressRef.current)
          const signature = await signMessageWithProvider(provider, addressRef.current, message)
          return { address: addressRef.current, message, signature }
        },
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
      setError(getPaymentErrorMessage(result.error || ''))
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
      const addr = addressRef.current
      // Access follows the WALLET, not the device. Prefer a wallet-tied check so
      // the server re-issues access from the wallet's paid receipt (no re-pay);
      // a stored proof is only honored as a session fallback while a wallet is
      // actually connected — a bare proof must never grant content with no
      // wallet, otherwise access would be device-bound instead of wallet-bound.
      if (addr) {
        try {
          const res = await fetch(accessPathFor(accessPath), {
            headers: { accept: 'application/json' },
          })
          const data = await res.json().catch(() => ({}))
          if (!cancelled && data?.ok) {
            const nextProof = data?.unlockProof || storedProof(resource.id)
            try { if (data?.unlockProof) localStorage.setItem(`${PROOF_PREFIX}${resource.id}`, nextProof) } catch {}
            setPayload(data)
            setProof(nextProof)
            setUnlocked(true)
            onUnlockRef.current?.({ ok: true, payload: data, resource })
            setChecking(false)
            return
          }
        } catch {}
      }
      const existingProof = addr ? storedProof(resource.id) : null
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
  }, [resource.id, accessPath, accessPathFor, address])

  // A disconnect must release the body from this device: tear down the
  // unlocked payload and drop any stored proof. Access is wallet-bound — on
  // reconnect the backend re-verifies the wallet's paid receipt and ban status
  // and serves the content again (no re-pay).
  useEffect(() => {
    if (isConnected) {
      everConnectedRef.current = true
      return
    }
    // Initial page load (never connected in this session): the stored proof
    // belongs to a returning wallet — keep it so the reconnect path can
    // present it. Only an explicit disconnect within this session releases it.
    if (!everConnectedRef.current) return
    everConnectedRef.current = false
    try { localStorage.removeItem(`${PROOF_PREFIX}${resource.id}`) } catch {}
    setUnlocked(false)
    setPayload(null)
    setProof('')
    setError(null)
    setStatus('')
  }, [isConnected, resource.id])

  return { busy, checking, status, error, unlocked, payload, proof, address, connect, disconnect, unlock, clear, gatewayBalance, refreshGatewayBalance, walletBalance, refreshWalletBalance, paymentRail, setPaymentRail: switchRail }
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

export function NibgateUnlockUI({ resource, busy, checking, status, error, address, disconnect, unlock, connect, gatewayBalance, gatewayBalanceUrl, walletBalance, paymentRail, setPaymentRail }) {
  const lottieRef = useRef(null)
  const [holdPct, setHoldPct] = useState(0)
  const [holdTransition, setHoldTransition] = useState('none')
  const [showGateway, setShowGateway] = useState(false)
  const holdRef = useRef({ timer: null, active: false, complete: false })
  const isBusy = busy || checking
  const isConnected = Boolean(address)
  const isDirect = paymentRail === 'transfer'
  const price = resource.price && resource.price !== '0'
    ? `${resource.price} ${resource.currency || 'USDC'}`
    : 'free'
  const isFree = !resource.price || String(resource.price).trim() === '0' || String(resource.price).trim() === ''
  const priceNum = Number(resource.price)
  const originalNum = Number(resource.originalPrice)
  // A whitelist tier (or discount) in play: show the public price struck out
  // next to the payer's actual price, mirroring the admin "what visitors will
  // see" preview.
  const showOriginal = Number.isFinite(originalNum) && originalNum > 0 && Number.isFinite(priceNum) && priceNum !== originalNum

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
      {showOriginal && (
        <div style={{ fontSize: 13, color: 'var(--muted, #6b6862)', marginBottom: 12 }}>
          <span style={{ textDecoration: 'line-through' }}>{originalNum} {resource.currency || 'USDC'}</span>{' '}
          <span style={{ color: '#7c9a6d', fontWeight: 600 }}>whitelisted price</span>
        </div>
      )}
      <div style={{ fontSize: 21, color: 'var(--muted, #6b6862)', marginBottom: 24 }}>
        Pay to unlock this content
      </div>
      <div
        role="tablist"
        aria-label="Payment rail"
        style={{
          display: 'flex',
          gap: 6,
          background: 'var(--border, #cecdc3)',
          padding: 4,
          borderRadius: 10,
          marginBottom: 24,
          width: '100%',
          maxWidth: 340,
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={!isDirect}
          onClick={() => setPaymentRail?.('gateway')}
          style={{
            flex: 1,
            padding: '8px 0',
            fontSize: 13,
            fontWeight: 600,
            border: 0,
            borderRadius: 7,
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: !isDirect ? 'var(--fg, #0a0a0a)' : 'var(--muted, #6b6862)',
            background: !isDirect ? 'var(--bg, #f4f4f0)' : 'transparent',
            boxShadow: !isDirect ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          Gateway
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isDirect}
          onClick={() => setPaymentRail?.('transfer')}
          style={{
            flex: 1,
            padding: '8px 0',
            fontSize: 13,
            fontWeight: 600,
            border: 0,
            borderRadius: 7,
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: isDirect ? 'var(--fg, #0a0a0a)' : 'var(--muted, #6b6862)',
            background: isDirect ? 'var(--bg, #f4f4f0)' : 'transparent',
            boxShadow: isDirect ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          Direct
        </button>
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
            {isDirect ? (
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: 'nowrap' }}>
                · {walletBalance || '0.00 USDC'}
              </span>
            ) : (
              <button
                type="button"
                style={{ ...labelButtonStyle, cursor: 'pointer', color: 'var(--accent, #7c9a6d)', whiteSpace: 'nowrap' }}
                onClick={() => setShowGateway(true)}
              >
                · {gatewayBalance} <DepositIcon />
              </button>
            )}
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

// Persistent wallet status shown once content is unlocked, so visitors can
// always disconnect — the gate footer (which carries the address + disconnect)
// disappears once the paywall is replaced by the unlocked content.
function NibgateWalletBar({ address, onDisconnect }) {
  if (!address) return null
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        rowGap: 8,
        marginTop: 40,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 'clamp(13px, 3.4vw, 15px)',
        color: 'var(--muted, #6b6862)',
        textAlign: 'center',
      }}
    >
      <span>{shortAddress(address)}</span>
      <button type="button" style={{ ...labelButtonStyle, cursor: 'pointer' }} onClick={() => onDisconnect?.()}>
        · Disconnect
      </button>
    </div>
  )
}

export function NibgateUnlock({ resource, accessPath, gatewayBalanceUrl, onUnlock, children, authBase = '', noncePath = '', verifyPath = '', walletBar = true }) {
  const state = useNibgateUnlock({ resource, accessPath, gatewayBalanceUrl, onUnlock, authBase, noncePath, verifyPath })
  if (state.unlocked) {
    const content = typeof children === 'function' ? children(state) : children
    return (
      <>
        {content}
        {walletBar && <NibgateWalletBar address={state.address} onDisconnect={state.disconnect} />}
      </>
    )
  }
  return <NibgateUnlockUI {...state} resource={resource} gatewayBalanceUrl={gatewayBalanceUrl} />
}
