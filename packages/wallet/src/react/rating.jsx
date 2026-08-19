'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { createPublicClient, createWalletClient, custom, encodeFunctionData, http, keccak256, stringToBytes } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { ARC_TESTNET, arcTestnet, isArcNetwork } from '../chain.js'
import { ensureArcNetwork } from '../network.js'
import { getWalletErrorMessage, isWalletRejection } from '../errors.js'

const RATE_CONTENT_SELECTOR = '0xc62fad09'
const ZERO_HASH = `0x${'0'.repeat(64)}`
const NIBGATE_CONTENT_HASH_NAMESPACE = 'nibgate:content:v1'

export const NIBGATE_REPUTATION_CHAIN_ID = 5042002
export const NIBGATE_REPUTATION_CHAIN_NAME = 'Arc Testnet'
export const NIBGATE_REPUTATION_CONTRACT = '0x9f27fd62e75f86a3c7addfdba443aab1f930e281'

export const NIBGATE_REPUTATION_ABI = [
  {
    type: 'function',
    name: 'rateContent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contentId', type: 'bytes32' },
      { name: 'rating', type: 'uint8' },
      { name: 'reviewHash', type: 'bytes32' },
      { name: 'unlockRef', type: 'string' }
    ],
    outputs: []
  }
]

function cleanDomain(domain = '') {
  return String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

function isCanonicalContentHash(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim())
}

function contentHashFor(domain, externalId, url) {
  return keccak256(stringToBytes([
    NIBGATE_CONTENT_HASH_NAMESPACE,
    cleanDomain(domain),
    externalId,
    url,
  ].join('|')))
}

function canonicalContentHash(resource) {
  const id = resource?.id
  if (!id) return undefined
  const path = resource?.path
  const url = resource?.url || (typeof window !== 'undefined' && path
    ? `${window.location.origin}${path.startsWith('/') ? path : '/' + path}`
    : undefined)
  if (!url) return undefined
  try {
    const domain = cleanDomain(new URL(url).hostname)
    return contentHashFor(domain, id, url)
  } catch {
    return undefined
  }
}

function normalizeContentId(value = '', resource) {
  const explicit = String(value || '').trim()
  if (isCanonicalContentHash(explicit)) return explicit
  const derived = canonicalContentHash(resource)
  if (derived) return derived
  if (explicit) return explicit
  throw new Error('contentId/contentHash is required to rate this content.')
}

function normalizeRatingValue(value) {
  const numeric = Number.parseFloat(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(1, Math.min(50, numeric <= 5 ? Math.round(numeric * 10) : Math.round(numeric)))
}

function shortAddress(a) {
  if (!a) return ''
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

const arcPublicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET.appRpcUrl) })

export function NibgateRatingUI({
  resource,
  contentId,
  statsUrl,
  apiBase,
  indexUrl,
  siteId,
  token,
  unlockRef,
  paymentId,
  onRated,
  onError,
}) {
  const { isConnected, address } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('eip155')
  const { open } = useAppKit()

  const [selected, setSelected] = useState(0)
  const [hover, setHover] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Tap stars to rate')
  const [statusColor, setStatusColor] = useState('')
  const [stats, setStats] = useState(null)

  const addressRef = useRef(address)
  const walletProviderRef = useRef(walletProvider)
  const statusTimerRef = useRef(null)

  useEffect(() => { addressRef.current = address }, [address])
  useEffect(() => { walletProviderRef.current = walletProvider }, [walletProvider])
  useEffect(() => () => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current) }, [])

  const statsUrlRef = useRef(statsUrl)
  const apiBaseRef = useRef(apiBase)
  useEffect(() => { statsUrlRef.current = statsUrl }, [statsUrl])
  useEffect(() => { apiBaseRef.current = apiBase }, [apiBase])

  const setStatusMsg = useCallback((msg, color, autoClear) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    setStatus(msg || '')
    setStatusColor(color || '')
    if (autoClear) statusTimerRef.current = setTimeout(() => setStatusMsg(selected > 0 ? '' : 'Tap stars to rate'), autoClear)
  }, [selected])

  const refresh = useCallback(() => {
    const u = statsUrlRef.current || (resource?.id ? `${apiBaseRef.current || '/api'}/rating/${resource.id}` : null)
    if (!u) return
    fetch(u)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.count > 0) {
          setStats({ average: Number(d.average || 0).toFixed(1), count: d.count })
        } else {
          setStats(null)
        }
      })
      .catch(() => {})
  }, [resource?.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function waitForWallet(timeoutMs = 30000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (addressRef.current) return addressRef.current
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return undefined
  }

  const connect = useCallback(async () => {
    await open()
    const addr = await waitForWallet()
    return Boolean(addr)
  }, [open])

  async function rate(value) {
    if (busy) return
    setBusy(true)
    setSelected(value)
    setStatus('Submitting…')
    setStatusColor('')
    try {
      if (!addressRef.current) {
        setStatus('Connect your wallet to continue.')
        const connected = await connect()
        if (!connected) {
          setSelected(0)
          setStatusMsg('Tap stars to rate')
          return
        }
      }
      const provider = walletProviderRef.current
      if (!provider || typeof provider.request !== 'function') {
        throw new Error('Wallet provider is not available. Connect your wallet to continue.')
      }
      let currentChainId
      try {
        const hex = await provider.request({ method: 'eth_chainId' })
        currentChainId = typeof hex === 'string' ? Number(hex) : Number(hex)
      } catch { currentChainId = undefined }
      if (currentChainId === undefined || !isArcNetwork(currentChainId)) {
        await ensureArcNetwork(provider, { currentChainId })
      }

      const cid = normalizeContentId(contentId, resource)
      const ratingValue = normalizeRatingValue(value)
      const reviewHash = ZERO_HASH
      const ref = String(unlockRef || paymentId || '')
      const data = encodeFunctionData({
        abi: NIBGATE_REPUTATION_ABI,
        functionName: 'rateContent',
        args: [cid, ratingValue, reviewHash, ref],
      })

      // Send through the AppKit EIP-1193 provider via a viem wallet client
      // (mirrors unlock.jsx) instead of wagmi's sendTransactionAsync, which
      // throws "Connector not connected" while wagmi's connector is null.
      const walletClient = createWalletClient({ chain: ARC_TESTNET, account: addressRef.current, transport: custom(provider) })
      const txResult = await walletClient.sendTransaction({ to: NIBGATE_REPUTATION_CONTRACT, data, chain: ARC_TESTNET, account: addressRef.current })
      const txHash = txResult?.hash || txResult

      // Wait for the receipt so downstream indexers (subblog + hub) can verify
      // the on-chain proof instead of racing ahead of mining.
      try {
        await waitForTransactionReceipt(arcPublicClient, { hash: txHash, chainId: ARC_TESTNET.id, timeout: 60_000 })
      } catch {
        // Fall through — the tx may still mine; downstream verifiers decide.
      }

      const result = { txHash, walletAddress: addressRef.current, contentId: cid, ratingValue, reviewHash }
      if (indexUrl) {
        fetch(indexUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            siteId,
            token,
            contentId: resource?.id,
            contentHash: cid,
            txHash,
            walletAddress: addressRef.current,
            ratingValue,
            pageOrigin: typeof window !== 'undefined' ? window.location.origin : '',
            resource,
            url: resource?.url,
            path: resource?.path,
            actor: 'human',
          }),
        }).catch(() => null)
      }
      onRated?.(result)
      setStatusMsg(`You rated ${value} ${'★'.repeat(value)}`, 'var(--accent, #7c9a6d)', 3000)
      refresh()
    } catch (err) {
      const message = isWalletRejection(err) ? 'Request cancelled.' : getWalletErrorMessage(err) || 'Could not save rating. Try again.'
      setStatusMsg(message, '#dc2626')
      setSelected(0)
      onError?.(err)
    } finally {
      setBusy(false)
    }
  }

  const stars = [1, 2, 3, 4, 5]
  const avg = stats ? `${stats.average} — ${stats.count} rating${stats.count !== 1 ? 's' : ''}` : 'No ratings yet'
  const label = hover > 0 ? ['', 'Poor', 'Below average', 'Average', 'Good', 'Excellent'][hover] : status

  return (
    <div style={{ textAlign: 'center', padding: '28px 0', fontFamily: 'var(--font-content, inherit)', color: 'var(--fg, #0a0a0a)' }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
        {stars.map((v) => {
          const active = hover > 0 ? v <= hover : v <= selected
          return (
            <button
              key={v}
              type="button"
              aria-label={`${v} star${v > 1 ? 's' : ''}`}
              disabled={busy}
              onMouseEnter={() => { if (!busy) setHover(v) }}
              onMouseLeave={() => setHover(0)}
              onFocus={() => { if (!busy) setHover(v) }}
              onBlur={() => setHover(0)}
              onClick={() => rate(v)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rate(v) } }}
              style={{
                background: 'none',
                border: 'none',
                cursor: busy ? 'default' : 'pointer',
                padding: 4,
                fontSize: 31,
                lineHeight: 1,
                color: active ? 'var(--accent, #7c9a6d)' : 'var(--border, #cecdc3)',
                transform: active ? 'scale(1.08)' : 'scale(1)',
                transition: 'color .12s, transform .12s',
                borderRadius: 4,
                fontFamily: 'inherit',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {active ? '★' : '☆'}
            </button>
          )
        })}
        <span style={{ fontSize: 17, color: 'var(--muted, #6b6862)', marginLeft: 12 }}>{avg}</span>
      </div>
      <div style={{ fontSize: 17, color: statusColor || 'var(--muted, #6b6862)', marginTop: 8, minHeight: '1.4em' }}>{label}</div>
      {isConnected && (
        <div style={{ fontSize: 13, color: 'var(--muted, #6b6862)', marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
          {shortAddress(address)}
        </div>
      )}
    </div>
  )
}
