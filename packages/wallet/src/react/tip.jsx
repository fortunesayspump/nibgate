'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { encodeFunctionData, createWalletClient, custom } from 'viem'
import { activeArcChain, activeChain, isActiveChainId } from '../chain.js'
import { ensureArcNetwork } from '../network.js'
import { getWalletErrorMessage, isWalletRejection } from '../errors.js'

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

function shortAddress(a) {
  if (!a) return ''
  return `${a.slice(0, 6)}...${a.slice(-4)}`
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
    amount: Number(accept.amount || amount || resource?.tipAmount || resource?.price || 0),
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
  const MIN_TIP = Number(minAmount ?? 0.1);

  async function waitForWallet(timeoutMs = 30000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (addressRef.current) return addressRef.current
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return null
  }

  const tip = useCallback(async (tipAmount) => {
    let account = address
    if (!account) {
      // No wallet: open the connect modal and wait for the user, instead of
      // just erroring — a tip click with no wallet should bring up connect.
      setStatus('connecting')
      try { await open() } catch {}
      account = await waitForWallet()
      if (!account) throw new Error('Connect your wallet to tip.')
    }
    const provider = providerRef.current
    if (!provider?.request) throw new Error('Wallet provider is not available.')
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
    if (!resolved && (!base || !domain)) throw new Error('No recipient to tip.')
    if (!(target.amount > 0)) throw new Error('Tip amount must be above zero.')
    if (!(target.amount >= MIN_TIP)) throw new Error(`Minimum tip is $${MIN_TIP.toFixed(2)}.`)
    // Hosted creators are paid through their per-creator fee wallet (CREATE2),
    // not the creator EOA, so the hub can verify the tx and split the fee.
    // Resolve the payee via the tip challenge; fall back to the creator.
    let payToAddr = resolved ? target.to : '';
    if (base && payToAddr) {
      try {
        const chRes = await fetch(`${base}/hub/tips/challenge`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contentUrl, title: resource?.title || '', amount: target.amount, currency: 'USDC', recipient: payToAddr }),
        });
        const ch = await chRes.json().catch(() => ({}));
        if (chRes.ok && ch?.payee && /^0x[a-fA-F0-9]{40}$/.test(ch.payee)) payToAddr = ch.payee;
      } catch {}
    }
    setStatus('switching')
    setError('')
    try {
      let currentChainId
      try {
        const hex = await provider.request({ method: 'eth_chainId' })
        currentChainId = typeof hex === 'string' ? Number(hex) : Number(hex)
      } catch { currentChainId = undefined }
      if (currentChainId === undefined || !isActiveChainId(currentChainId)) {
        await ensureArcNetwork(provider, { currentChainId })
      }
      setStatus('signing')
      const walletClient = createWalletClient({ chain: activeArcChain(), account, transport: custom(provider) })
      const sendTo = async (to, amt) => {
        const data = encodeFunctionData({
          abi: USDC_TRANSFER_ABI,
          functionName: 'transfer',
          args: [to, BigInt(Math.round(amt * 1e6))],
        })
        const txHash = await walletClient.sendTransaction({ to: USDC, data, chain: activeArcChain(), account })
        return txHash?.hash || txHash || ''
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
        if (!chalRes.ok || !chal?.box) throw new Error(chal?.error || `Hold failed: ${chalRes.status}`)
        const hash = await sendTo(chal.box, target.amount)
        const held = await fetch(`${base}/hub/tips/hold`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...holdBody, txHash: hash, walletAddress: account }),
        }).then((r) => r.json()).catch(() => ({}))
        const out = {
          type: 'tip', held: true, status: 'held', txHash: hash, paymentId: hash,
          amount: target.amount, currency: 'USDC', network: activeChain().caip2,
          domain, box: chal.box, payer: account, recipient: '',
          contentId: contentId || undefined, imageUrl: imageUrl || undefined,
          resource: contentUrl, title: resource?.title || '', receipt: held?.tip || null,
        }
        setReceipt(out)
        setStatus('done')
        onPaid?.(out)
        return out
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
      // Record on the hub (best-effort; the chain tx is the truth). Send the
      // CREATOR as recipient so the hub resolves the fee-wallet payee itself.
      if (base) {
        fetch(`${base}/hub/tips/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contentUrl,
            title: resource?.title || '',
            amount: target.amount,
            currency: 'USDC',
            recipient: recipient || resource?.recipient || '',
            paymentRail: 'transfer',
            txHash: hash,
            walletAddress: account,
            domain: domain || undefined,
            contentId: contentId || undefined,
            websiteId: websiteId || undefined,
            imageUrl: imageUrl || undefined,
          }),
        }).then((r) => r.json()).then((d) => {
          if (d?.receipt) setReceipt({ ...out, ...d.receipt });
          if (d?.success) onPaid?.(d);
        }).catch(() => {});
      }
      setReceipt(out)
      setStatus('done')
      onPaid?.(out)
      return out
    } catch (e) {
      const msg = getWalletErrorMessage(e) || (isWalletRejection(e) ? 'Request cancelled.' : String(e?.message || e))
      setError(msg)
      setStatus('error')
      throw e
    }
  }, [address, walletProvider, resource, challenge, recipient, amount, apiBase, onPaid])

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

  return { tip, refund, status, error, receipt, isConnected, address, chain: activeChain() }
}

// Compact inline tip control: "Tip me" button + amount, no chrome.
export function NibgateTipInline({ resource, challenge, recipient, amount, amounts, minAmount, apiBase, onPaid, style }) {
  const { tip, status, error } = useNibgateTip({ resource, challenge, recipient, amount, minAmount, apiBase, onPaid })
  const min = Number(minAmount ?? 0.1);
  const presets = (Array.isArray(amounts) && amounts.length ? amounts : [0.25, 1]).filter((a) => Number(a) >= min);
  const busy = status === 'switching' || status === 'signing'
  return (
    <span data-nibgate-tip-inline style={{ display: 'inline-flex', gap: 8, alignItems: 'center', ...(style || {}) }}>
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
      {status === 'done' ? <span style={{ fontSize: 12 }}>✓</span> : null}
      {error ? <span style={{ fontSize: 12, color: '#dc2626' }}>{error}</span> : null}
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
  const busy = status === 'switching' || status === 'signing'
  const label = error || (status === 'switching' ? 'Switching network…' : status === 'signing' ? 'Confirm in your wallet…' : status === 'done' ? 'Tipped ✓' : 'Tip the creator')
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
      <div style={{ fontSize: 17, color: error ? '#dc2626' : 'var(--muted, #6b6862)', marginTop: 8, minHeight: '1.4em' }}>
        {(busy || error) ? label : <CtaButton custom={custom} hoverCta={hoverCta} setHoverCta={setHoverCta} onTip={(a) => tip(a).catch(() => {})} />}
      </div>
      {receipt || isConnected ? (
        <div style={{ fontSize: 13, color: 'var(--muted, #6b6862)', marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
          {receipt ? shortAddress(receipt.txHash) : shortAddress(address)}
        </div>
      ) : null}
    </div>
  )
}
