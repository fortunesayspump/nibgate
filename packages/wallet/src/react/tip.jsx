'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { encodeFunctionData, createPublicClient, createWalletClient, custom } from 'viem'
import { activeArcChain, activeChain } from '../chain.js'
import { ArcConnectionError, classifyArcRpcError, ensureArcNetwork } from '../network.js'
import { getWalletErrorMessage } from '../errors.js'
import { ConfirmationMark, PaymentFeedbackStyles } from './payment-feedback.jsx'

const USDC = '0x3600000000000000000000000000000000000000'
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

// balanceOf for the pre-send gate below (transfer path spends wallet USDC,
// not Gateway credit — the wallet is what must hold the amount).
const USDC_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
]

function shortAddress(a) {
  if (!a) return ''
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

// Only copy messages that this module creates. Provider/RPC errors can contain
// request bodies, signatures or credential-bearing URLs, so never reflect them.
class TipValidationError extends Error {}

function isConfirmedTipReceipt(value, pending) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (typeof value.paymentId !== 'string' || !value.paymentId.trim()) return false
  if (pending.held) {
    if (typeof value.id !== 'string' || !value.id.trim() || value.status !== 'held') return false
  } else if (value.type !== 'tip' || (value.status != null && value.status !== 'settled')) return false
  // Both the normal receipt and persisted held row include the settled amount.
  // Prisma-backed rows may serialize numeric values as strings.
  if (!['number', 'string'].includes(typeof value.amount) || !String(value.amount).trim()) return false
  const amount = Number(value.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount !== Number(pending.receipt.amount) || value.currency !== pending.receipt.currency) return false
  // Gateway receipts can have no on-chain hash; their paymentId is the proof
  // identity. If a hash is supplied, it must identify this submitted transfer.
  if (value.txHash != null && (typeof value.txHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value.txHash) || value.txHash.toLowerCase() !== pending.receipt.txHash.toLowerCase())) return false
  return true
}

function tipErrorMessage(error) {
  if (error instanceof TipValidationError) return error.message
  if (error instanceof ArcConnectionError) return `${error.message}${error.method === 'eth_sendTransaction' ? ' Check wallet activity for a transaction before trying again.' : ''}`
  const net = activeChain().name
  let current = error
  let rpcFailure = false
  const seen = new Set()
  for (let depth = 0; current && depth < 5 && !seen.has(current); depth++) {
    seen.add(current)
    const code = current?.code
    const message = typeof current === 'string' ? current :
      [current?.shortMessage, current?.message, current?.details].filter((s) => typeof s === 'string').join(' ')
    const text = String(message || '').slice(0, 4000)
    const mapped = getWalletErrorMessage({ code, message: text }, { defaultMessage: null })
    if (mapped) return mapped
    if (code === 4901 || /chain mismatch|does not match the target chain|not on the correct chain/i.test(text)) {
      return `Switch your wallet to ${net} before tipping.`
    }
    if (code === 4200 || code === -32601 || /method (?:is )?not (?:supported|found)/i.test(text)) {
      return `This wallet does not support the required request. Connect an EVM wallet that supports ${net}.`
    }
    if (/rpc|network|fetch|timeout|timed out/i.test(text)) rpcFailure = true
    current = typeof current === 'object' ? current.cause : null
  }
  return rpcFailure
    ? `The wallet could not complete its connection to ${net}. Check your wallet activity for a transaction before trying again.`
    : 'The tip could not be completed. Check your wallet activity for a transaction before trying again.'
}

// Minimal coffee-cup glyph. Inline SVG, currentColor — blends into any theme.
function TipIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 7c0-1.2.9-1.2.9-2.4M12 7c0-1.2.9-1.2.9-2.4" />
    </svg>
  )
}

const textBtn = {
  background: 'transparent',
  border: 0,
  padding: '2px 4px',
  cursor: 'pointer',
  color: 'inherit',
  font: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

// Canonical absolute URL for a tip target. Creator sites usually pass a
// relative path (resource.path); the hub attributes tips by URL, so absolutize
// against the current origin before sending.
function resolveContentUrl(resource) {
  const raw = String(resource?.url || resource?.path || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (typeof window !== 'undefined' && window.location?.origin) {
    try { return new URL(raw, window.location.origin).href } catch { return raw }
  }
  return raw
}

// Resolve the tip recipient + amount from props (direct mode) or a challenge.
function resolveTarget({ resource, challenge, recipient, amount }) {
  const accept = challenge?.accepts?.[0] || {}
  return {
    to: String(accept.payTo || accept.recipient || recipient || resource?.recipient || ''),
    amount: Number(accept.amount || amount || resource?.tipAmount || resource?.price || 0) / (accept.amount && (challenge?.paymentRail === 'gateway' || accept.extra?.name === 'GatewayWalletBatched') ? 1e6 : 1),
    network: accept.network || resource?.network,
  }
}

export function useNibgateTip({ resource, challenge, recipient, amount, minAmount, apiBase, onPaid } = {}) {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('eip155')
  const { open } = useAppKit()
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const providerRef = useRef(null)
  useEffect(() => { providerRef.current = walletProvider || null }, [walletProvider])
  const addressRef = useRef(null)
  useEffect(() => { addressRef.current = address || null }, [address])
  const pendingRef = useRef(null)
  const inFlightRef = useRef(false)
  const MIN_TIP = Number(minAmount ?? 0.1);

  async function waitForWallet(timeoutMs = 30000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (addressRef.current) return addressRef.current
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return null
  }

  // Keep the exact submitted proof in memory until the hub confirms it.
  // Retrying verification must never submit a second wallet transaction.
  const verifyPending = useCallback(async () => {
    const pending = pendingRef.current
    if (!pending) throw new TipValidationError('No submitted tip needs verification.')
    if (pending.blocked) throw new TipValidationError('This payment proof is already recorded. Check its existing receipt before taking any further action.')
    setStatus('verifying')
    let body = {}
    if (pending.verify) {
      const mined = await pending.verify()
      if (mined?.status !== 'success' || typeof mined.transactionHash !== 'string' || mined.transactionHash.toLowerCase() !== pending.receipt.txHash.toLowerCase()) {
        throw new TipValidationError('The original tip transaction is not confirmed. Check its receipt before sending another tip.')
      }
    } else {
      const res = await fetch(pending.url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pending.body),
      })
      body = await res.json()
      if (res.status === 409 && body?.code === 'payment-verification-pending') {
        pending.reconciliation = true
        throw new TipValidationError('This submitted payment is still being reconciled. Keep its transaction hash; do not send another payment.')
      }
      if (res.status === 409 && body?.code === 'payment-proof-already-used') {
        pending.blocked = true
        setReceipt({ ...pending.receipt, status: 'conflict' })
        throw new TipValidationError('This payment proof is already recorded. Check its existing receipt; do not send another payment.')
      }
      pending.reconciliation = false
      if (!res.ok || body?.success !== true || (pending.held && body.holdStatus !== 'held') || !isConfirmedTipReceipt(pending.held ? body.tip : body.receipt, pending)) {
        throw new TipValidationError('The hub has not verified this transaction yet. Retry verification without sending another tip.')
      }
    }
    const out = {
      ...pending.receipt, ...(pending.held ? {} : body.receipt),
      held: pending.held, status: pending.held ? 'held' : 'settled',
      ...(pending.held ? { receipt: body.tip || null } : {}),
    }
    // Mark confirmation before notifying the host. A failing host callback
    // cannot cause duplicate onPaid notifications on verification retries.
    pendingRef.current = null
    setReceipt(out)
    setStatus('done')
    try { await onPaid?.(out) } catch {
      setError('Your tip is confirmed, but the page could not finish updating. Do not send another tip to retry that update.')
    }
    return out
  }, [onPaid])

  const tip = useCallback(async (tipAmount) => {
    if (inFlightRef.current) throw new TipValidationError('A tip is already in progress.')
    inFlightRef.current = true
    let submittedHash = pendingRef.current?.receipt.txHash || ''
    setError('')
    try {
      if (pendingRef.current) return await verifyPending()
      let account = address
      if (!account) {
        // No wallet: open the connect modal and wait for the user, instead of
        // just erroring — a tip click with no wallet should bring up connect.
        setStatus('connecting')
        try { await open() } catch {}
        account = await waitForWallet()
        if (!account) throw new TipValidationError('Connect your wallet to tip.')
      }
      const provider = providerRef.current
      if (!provider?.request) throw new TipValidationError('Wallet provider is not available. Reconnect your wallet to tip.')
      const assertSelectedWallet = () => {
        if (providerRef.current !== provider || String(addressRef.current || '').toLowerCase() !== String(account).toLowerCase()) {
          throw new TipValidationError('The connected wallet changed. Check the selected account before tipping.')
        }
      }
      const target = resolveTarget({ resource, challenge, recipient, amount: tipAmount ?? amount })
      const contentUrl = resolveContentUrl(resource)
      const contentId = resource?.contentId || resource?.id || ''
      const websiteId = resource?.websiteId || ''
      const imageUrl = resource?.imageUrl || ''
      const base = (apiBase || '').replace(/\/+$/, '')
      const resolved = target.to && /^0x[a-fA-F0-9]{40}$/.test(target.to)
      let domain = resource?.domain || ''
      if (!domain && contentUrl) { try { domain = new URL(contentUrl).hostname } catch { domain = '' } }
      // Unresolved/external creator: hold in the domain's no-key box. Needs a hub + domain.
      if (!resolved && (!base || !domain)) throw new TipValidationError('No recipient to tip.')
      if (target.network && target.network !== activeChain().caip2) throw new TipValidationError('The tip challenge and wallet network do not match.')
      if (!(target.amount > 0)) throw new TipValidationError('Tip amount must be above zero.')
      if (!(target.amount >= MIN_TIP)) throw new TipValidationError(`Minimum tip is $${MIN_TIP.toFixed(2)}.`)
      // Hosted creators must use the server-selected fee-wallet payee.
      // A failed challenge is not permission to bypass that destination.
      let payToAddr = resolved ? target.to : '';
      if (base && payToAddr) {
        const chRes = await fetch(`${base}/hub/tips/challenge`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contentUrl, title: resource?.title || '', amount: target.amount, currency: 'USDC', recipient: recipient || resource?.recipient || payToAddr, paymentRail: 'transfer' }),
        });
        const ch = await chRes.json();
        if (!chRes.ok || ch?.success === false || !/^0x[a-fA-F0-9]{40}$/.test(ch?.payee || '')) {
          throw new TipValidationError('Could not prepare the tip payment. No transaction was sent. Try again later.')
        }
        const net = ch.accepts?.[0]?.network
        if (net && net !== activeChain().caip2) throw new TipValidationError('The tip hub and wallet network do not match. Choose the matching hub before tipping.')
        payToAddr = ch.payee;
      }
      setStatus('switching')
      assertSelectedWallet()
      await ensureArcNetwork(provider)
      assertSelectedWallet()
      setStatus('signing')
      const walletClient = createWalletClient({ chain: activeArcChain(), account, transport: custom(provider) })
      const sendTo = async (to, amt) => {
        const value = BigInt(Math.round(amt * 1e6))
        // Pre-send balance gate: a doomed transfer reverts onchain ("transfer
        // amount exceeds balance") and still burns gas — gas is USDC on Arc.
        // Refuse up front with the actual balance named. Unreadable balance
        // (RPC blip) falls through: the wallet enforces it anyway.
        let walletBal = null
        try {
          const pub = createPublicClient({ chain: activeArcChain(), transport: custom(provider) })
          walletBal = await pub.readContract({ address: USDC, abi: USDC_BALANCE_ABI, functionName: 'balanceOf', args: [account] })
        } catch { walletBal = null }
        if (walletBal !== null && walletBal < value) {
          const net = activeChain()
          const have = (Number(walletBal) / 1e6).toFixed(2)
          const need = (Number(value) / 1e6).toFixed(2)
          const fund = net.testnet
            ? 'Top up with free testnet USDC at faucet.circle.com (select Arc Testnet).'
            : 'Top up this wallet with USDC on Arc mainnet.'
          throw new TipValidationError(`Insufficient USDC on ${net.name}: need $${need} but ${shortAddress(account)} holds $${have}. ${fund} Balances do not cross networks, and Gateway credit cannot pay a direct transfer.`)
        }
        const data = encodeFunctionData({
          abi: USDC_TRANSFER_ABI,
          functionName: 'transfer',
          args: [to, value],
        })
        assertSelectedWallet()
        await ensureArcNetwork(provider)
        assertSelectedWallet()
        let txHash
        try { txHash = await walletClient.sendTransaction({ to: USDC, data, chain: activeArcChain(), account }) }
        catch (error) {
          const connection = classifyArcRpcError(error, 'eth_sendTransaction')
          if (connection.reason !== 'unavailable') throw connection
          throw error
        }
        const hash = txHash?.hash || txHash || ''
        if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new TipValidationError('The wallet did not return a valid transaction hash. Check wallet activity before trying another tip.')
        submittedHash = hash
        return hash
      }

      if (!resolved) {
        // Hold: challenge → pay the predicted box → record the held tip.
        const holdBody = {
          contentUrl, title: resource?.title || '', amount: target.amount, currency: 'USDC',
          domain, paymentRail: 'transfer',
          contentId: contentId || undefined, websiteId: websiteId || undefined, imageUrl: imageUrl || undefined,
        }
        const chalRes = await fetch(`${base}/hub/tips/hold`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(holdBody),
        })
        const chal = await chalRes.json().catch(() => ({}))
        if (!chalRes.ok || chal?.success === false || !/^0x[a-fA-F0-9]{40}$/.test(chal?.box || '')) throw new TipValidationError('Could not prepare the held tip. No transaction was sent.')
        const acceptance = chal.accepts?.[0]
        if (acceptance?.network && acceptance.network !== activeChain().caip2) throw new TipValidationError('The tip hub and wallet network do not match. Choose the matching hub before tipping.')
        if (acceptance && String(acceptance.payTo || acceptance.recipient || '').toLowerCase() !== chal.box.toLowerCase()) throw new TipValidationError('The tip challenge does not match its holding box.')
        const hash = await sendTo(chal.box, target.amount)
        const out = {
          type: 'tip', held: false, status: 'pending', txHash: hash, paymentId: hash,
          amount: target.amount, currency: 'USDC', network: activeChain().caip2,
          domain, box: chal.box, payer: account, recipient: '',
          contentId: contentId || undefined, imageUrl: imageUrl || undefined,
          resource: contentUrl, title: resource?.title || '', receipt: null,
        }
        pendingRef.current = { url: `${base}/hub/tips/hold`, body: { ...holdBody, txHash: hash, walletAddress: account }, held: true, receipt: out }
        setReceipt(out)
        return await verifyPending()
      }

      const hash = await sendTo(payToAddr, target.amount)
      const out = {
        type: 'tip',
        held: false,
        txHash: hash,
        paymentId: hash,
        amount: target.amount,
        currency: 'USDC',
        network: activeChain().caip2,
        recipient: target.to,
        payer: account,
        resource: contentUrl,
        title: resource?.title || '',
      }
      if (base) {
        pendingRef.current = {
          url: `${base}/hub/tips/verify`, held: false, receipt: { ...out, status: 'pending' },
          body: {
            contentUrl, title: resource?.title || '', amount: target.amount, currency: 'USDC',
            recipient: recipient || resource?.recipient || target.to,
            paymentRail: 'transfer', txHash: hash, walletAddress: account,
            domain: domain || undefined, contentId: contentId || undefined,
            websiteId: websiteId || undefined, imageUrl: imageUrl || undefined,
          },
        }
        setReceipt(pendingRef.current.receipt)
        return await verifyPending()
      }
      // Without a hub, retain the proof and wait for chain confirmation too.
      const publicClient = createPublicClient({ chain: activeArcChain(), transport: custom(provider) })
      pendingRef.current = {
        held: false, receipt: { ...out, status: 'pending' },
        verify: () => publicClient.waitForTransactionReceipt({ hash, checkReplacement: false }),
      }
      setReceipt(pendingRef.current.receipt)
      return await verifyPending()
    } catch (e) {
      // A returned hash changes the safe next step even if a page callback
      // subsequently fails. Never describe that as an unfunded/rejected tip.
      const msg = pendingRef.current?.reconciliation
        ? `Transaction ${submittedHash} is still being reconciled. Keep this hash and check its receipt; do not send another payment.`
        : pendingRef.current?.blocked
        ? `Payment proof ${submittedHash} is already recorded. Check its existing receipt; do not send another payment.`
        : submittedHash
        ? `Transaction ${submittedHash} was submitted, but confirmation is incomplete. ${pendingRef.current ? 'Retry verification; no additional payment will be sent.' : 'Check that transaction before sending another tip.'}`
        : tipErrorMessage(e)
      setError(msg)
      setStatus(pendingRef.current?.blocked ? 'blocked' : pendingRef.current ? 'pending' : 'error')
      if (submittedHash && e && typeof e === 'object') e.txHash = submittedHash
      throw e
    } finally {
      inFlightRef.current = false
    }
  }, [address, walletProvider, resource, challenge, recipient, amount, apiBase, onPaid, verifyPending, MIN_TIP])

  // Payer refund for an unclaimed held tip. Signs a control message; funds can
  // only ever return to the connected wallet.
  const refund = useCallback(async (heldDomain) => {
    const account = address
    const provider = providerRef.current
    if (!account) throw new Error('Connect your wallet to refund.')
    if (!provider?.request) throw new Error('Wallet provider is not available.')
    const base = (apiBase || '').replace(/\/+$/, '')
    if (!base) throw new Error('Refund needs apiBase.')
    const d = typeof heldDomain === 'string' ? heldDomain : (heldDomain?.domain || '')
    if (!d) throw new Error('Refund needs a domain.')
    const walletClient = createWalletClient({ chain: activeArcChain(), account, transport: custom(provider) })
    const message = `Nibgate tip refund\nDomain: ${d}\nWallet: ${String(account).toLowerCase()}\nIssued: ${new Date().toISOString()}`
    const signature = await walletClient.signMessage({ account, message })
    const res = await fetch(`${base}/hub/tips/refund`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: d, payer: account, message, signature }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body?.success === false) throw new Error(body?.error || `Refund failed: ${res.status}`)
    return body
  }, [address, walletProvider, apiBase])

  return { tip, retryVerification: () => pendingRef.current ? tip() : Promise.reject(new TipValidationError('No submitted tip needs verification.')), refund, status, error, receipt, isConnected, address, chain: activeChain() }
}

// Compact inline tip control: "Tip me" button + amount, no chrome.
function confirmedTip(status, receipt) {
  return status === 'done' && (receipt?.status === 'settled' || receipt?.status === 'held')
}

function TipConfirmation({ receipt }) {
  const held = receipt.held || receipt.status === 'held'
  const amount = Number(receipt.amount)
  const amountLabel = Number.isFinite(amount) && amount > 0
    ? `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`
    : ''
  return (
    <span data-nibgate-tip-confirmed={held ? 'held' : 'settled'} title={receipt.txHash || undefined} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: held ? 'inherit' : 'var(--fg, inherit)', fontWeight: 600 }}>
      {held ? null : <ConfirmationMark />}
      <span>{held ? 'Tip held' : 'Tip sent!'}{amountLabel ? ` ${amountLabel}` : ''}{held ? ' · awaiting the creator’s claim' : ''}</span>
    </span>
  )
}

function tipProgressLabel(status) {
  return {
    connecting: 'Connect your wallet…',
    switching: 'Switching network…',
    signing: 'Confirm in your wallet…',
    verifying: 'Confirming your tip…',
    pending: 'Tip submitted. Confirmation pending.',
    blocked: 'Check the existing payment receipt.',
  }[status] || ''
}

export function NibgateTipInline({ resource, challenge, recipient, amount, amounts, minAmount, apiBase, onPaid, style }) {
  const { tip, status, error, receipt } = useNibgateTip({ resource, challenge, recipient, amount, minAmount, apiBase, onPaid })
  const min = Number(minAmount ?? 0.1);
  const presets = (Array.isArray(amounts) && amounts.length ? amounts : [0.25, 1]).filter((a) => Number(a) >= min);
  const busy = status === 'connecting' || status === 'switching' || status === 'signing' || status === 'verifying' || status === 'pending' || status === 'blocked'
  return (
    <span data-nibgate-tip-inline style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', ...(style || {}) }}>
      <PaymentFeedbackStyles />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
        <TipIcon /> Tip me
      </span>
      {presets.map((a) => (
        <button
          key={String(a)}
          type="button"
          disabled={busy}
          onClick={() => tip(a).catch(() => {})}
          style={{ ...textBtn, opacity: busy ? 0.5 : 1, textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          ${a}
        </button>
      ))}
      <span role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: 12 }}>
        {confirmedTip(status, receipt) ? <TipConfirmation key={receipt.txHash || receipt.paymentId} receipt={receipt} /> : tipProgressLabel(status)}
        {error ? <span style={{ display: 'block', color: '#dc2626' }}>{error}</span> : null}
      </span>
      {status === 'pending' ? <button type="button" onClick={() => tip().catch(() => {})}>Retry verification</button> : null}
    </span>
  )
}

// Status-line CTA. One persistent element so the idle → armed change actually
// animates (dotted underline fades in, arrow slides on hover). Clicking with
// no valid amount is a no-op.
function CtaButton({ custom, hoverCta, setHoverCta, onTip }) {
  const armed = Number(custom) > 0;
  return (
    <button
      type="button"
      onClick={() => { if (armed) onTip(Number(custom)) }}
      onMouseEnter={() => setHoverCta(true)}
      onMouseLeave={() => setHoverCta(false)}
      onFocus={() => setHoverCta(true)}
      onBlur={() => setHoverCta(false)}
      style={{
        background: 'none', border: 0, padding: 0,
        cursor: armed ? 'pointer' : 'default',
        font: 'inherit',
        color: armed ? 'var(--fg, #0a0a0a)' : 'inherit',
        textDecoration: 'underline dotted',
        textUnderlineOffset: 4,
        textDecorationColor: armed ? 'currentColor' : 'transparent',
        transition: 'text-decoration-color .3s ease, color .3s ease, letter-spacing .3s ease',
        letterSpacing: armed && hoverCta ? '0.02em' : '0',
      }}
    >
      Tip the creator{' '}
      <span style={{ display: 'inline-block', opacity: armed ? 1 : 0, transform: armed ? (hoverCta ? 'translateX(3px)' : 'translateX(0)') : 'translateX(-4px)', transition: 'opacity .3s ease, transform .3s ease' }}>→</span>
    </button>
  );
}

// Full tip block, styled like NibgateRatingUI: centered, no title, amounts as
// the interactive row, status line beneath. Straight to the point.
export function NibgateTipCard({ resource, challenge, recipient, amount, amounts, minAmount, apiBase, onPaid, style }) {
  const { tip, status, error, receipt, isConnected, address } = useNibgateTip({ resource, challenge, recipient, amount, minAmount, apiBase, onPaid })
  const [custom, setCustom] = useState('')
  const [hover, setHover] = useState(null)
  const [hoverCta, setHoverCta] = useState(false)
  const min = Number(minAmount ?? 0.1);
  const presets = (Array.isArray(amounts) && amounts.length ? amounts : [0.25, 1]).filter((a) => Number(a) >= min);
  const busy = status === 'connecting' || status === 'switching' || status === 'signing' || status === 'verifying' || status === 'pending' || status === 'blocked'
  const confirmed = confirmedTip(status, receipt)
  // Clear only the entry field after authoritative confirmation. The receipt
  // keeps the paid amount, including when a host onPaid callback fails.
  useEffect(() => {
    if (!confirmed) return
    setCustom('')
    setHover(null)
    setHoverCta(false)
  }, [confirmed, receipt])
  const amountBtn = (a) => ({
    background: 'none',
    border: 'none',
    cursor: busy ? 'default' : 'pointer',
    padding: 4,
    fontSize: 24,
    lineHeight: 1,
    fontFamily: 'inherit',
    fontWeight: 600,
    color: hover === a ? 'var(--accent, #7c9a6d)' : 'var(--fg, #0a0a0a)',
    transform: hover === a ? 'scale(1.08)' : 'scale(1)',
    transition: 'color .12s, transform .12s',
    borderRadius: 4,
    opacity: busy ? 0.6 : 1,
  })
  return (
    <div data-nibgate-tip-card style={{ textAlign: 'center', padding: '28px 0', fontFamily: 'var(--font-content, inherit)', color: 'var(--fg, #0a0a0a)', ...(style || {}) }}>
      <PaymentFeedbackStyles />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--muted, #6b6862)' }}>
        <TipIcon size={26} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, minHeight: 44 }}>
        {presets.map((a) => (
          <button
            key={String(a)}
            type="button"
            aria-label={`Tip $${a}`}
            disabled={busy}
            onMouseEnter={() => { if (!busy) setHover(a) }}
            onMouseLeave={() => setHover(null)}
            onFocus={() => { if (!busy) setHover(a) }}
            onBlur={() => setHover(null)}
            onClick={() => tip(a).catch(() => {})}
            style={amountBtn(a)}
          >
            ${a}
          </button>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
          <span style={{ fontSize: 17, color: 'var(--muted, #6b6862)' }}>$</span>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="custom"
            inputMode="decimal"
            aria-label="Custom tip amount in USDC"
            disabled={busy}
            onKeyDown={(e) => { if (e.key === 'Enter' && Number(custom) > 0) tip(Number(custom)).catch(() => {}) }}
            style={{ width: 76, border: 0, borderBottom: '1px solid var(--border, #cecdc3)', background: 'transparent', color: 'var(--fg, #0a0a0a)', fontFamily: 'inherit', fontSize: 17, padding: '2px 4px', outline: 'none' }}
          />
        </span>
        <span style={{ fontSize: 17, color: 'var(--muted, #6b6862)', marginLeft: 12 }}>USDC</span>
      </div>
      {min > 0 ? <div style={{ fontSize: 13, color: 'var(--muted, #6b6862)', marginTop: 6 }}>Minimum tip ${min.toFixed(2)} USDC</div> : null}
      {status === 'pending' ? <button type="button" onClick={() => tip().catch(() => {})}>Retry verification</button> : null}
      <div role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: 17, color: 'var(--muted, #6b6862)', marginTop: 8, minHeight: '1.4em' }}>
        {confirmed ? <TipConfirmation key={receipt.txHash || receipt.paymentId} receipt={receipt} /> : busy ? tipProgressLabel(status) : error ? null : <CtaButton custom={custom} hoverCta={hoverCta} setHoverCta={setHoverCta} onTip={(a) => tip(a).catch(() => {})} />}
        {error ? <div style={{ color: '#dc2626' }}>{error}</div> : null}
      </div>
      {confirmed && Number(custom) > 0 ? <div style={{ fontSize: 17, marginTop: 6 }}><CtaButton custom={custom} hoverCta={hoverCta} setHoverCta={setHoverCta} onTip={(a) => tip(a).catch(() => {})} /></div> : null}
      {receipt || isConnected ? (
        <div style={{ fontSize: 13, color: 'var(--muted, #6b6862)', marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
          {receipt ? shortAddress(receipt.txHash) : shortAddress(address)}
        </div>
      ) : null}
    </div>
  )
}
