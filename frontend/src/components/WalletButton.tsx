'use client'

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useChainId, useDisconnect } from "@nibgate/wallet/react";
import { arcTestnet } from '../lib/wagmi'
import { getConnectedChainId, isArcTestnetChainId } from '../lib/chains'
import { createPublicClient, http } from 'viem'
import { getHubSessionAddress, HUB_SESSION_CLEARED_EVENT, HUB_SESSION_UPDATED_EVENT } from '../lib/hubSession'
import { useNibgateConnect } from '../lib/useNibgateConnect'

function shortAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isHexAddress(address?: string | null): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address ?? '')
}

const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const GATEWAY_ABI = [{ name: 'availableBalance', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'depositor', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }] as const
const SEL_APPROVE = '0x095ea7b3'
const SEL_DEPOSIT = '0x47e7ef24'
const SEL_WITHDRAW = '0xf3fef3a3'

const gatewayClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0]),
})

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)
}

function parse6(v: string) {
  const [w = '0', f = ''] = v.split('.')
  return BigInt(w + f.padEnd(6, '0').slice(0, 6))
}

function addr32(a: string) { return '000000000000000000000000' + a.slice(2) }

function GatewayBridgeModal({ address, gatewayBal, walletBal, onClose }: { address: string; gatewayBal: number; walletBal: number; onClose: () => void }) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function doDeposit() {
    if (!amount || Number(amount) <= 0) { setStatus('Enter an amount'); return }
    if (!window.ethereum) { setStatus('No wallet found'); return }
    setBusy(true)
    try {
      setStatus('Approving USDC\u2026')
      const amt = parse6(amount).toString(16)
      const eth = window.ethereum as any;
      await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from: address, to: USDC_ADDRESS, data: SEL_APPROVE + addr32(GATEWAY_WALLET_ADDRESS) + amt.padStart(64, '0') }],
      })
      setStatus('Depositing\u2026')
      await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from: address, to: GATEWAY_WALLET_ADDRESS, data: SEL_DEPOSIT + addr32(USDC_ADDRESS) + amt.padStart(64, '0') }],
      })
      setStatus('Deposited!')
    } catch (e: any) { setStatus(e?.message || 'Failed') }
    setBusy(false)
  }

  async function doWithdraw() {
    if (!amount || Number(amount) <= 0) { setStatus('Enter an amount'); return }
    if (!window.ethereum) { setStatus('No wallet found'); return }
    setBusy(true)
    try {
      setStatus('Withdrawing\u2026')
      const amt = parse6(amount).toString(16)
      const eth = window.ethereum as any;
      await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from: address, to: GATEWAY_WALLET_ADDRESS, data: SEL_WITHDRAW + addr32(USDC_ADDRESS) + amt.padStart(64, '0') }],
      })
      setStatus('Withdrawn!')
    } catch (e: any) { setStatus(e?.message || 'Failed') }
    setBusy(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg,#f4f4f0)', borderRadius: 16, maxWidth: 540, width: '100%', padding: 28, position: 'relative', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 28, cursor: 'pointer', color: 'var(--muted,#6b6862)', lineHeight: 1 }}>×</button>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, background: 'var(--bg,#f4f4f0)', border: '1px solid var(--border,#cecdc3)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted,#6b6862)', marginBottom: 4, letterSpacing: '.02em' }}>{shortAddress(address as any)}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg,#0a0a0a)' }}>{fmt(walletBal)} USDC</div>
          </div>
          <div style={{ flex: 1, background: 'var(--bg,#f4f4f0)', border: '1px solid var(--border,#cecdc3)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted,#6b6862)', marginBottom: 4, letterSpacing: '.02em' }}>Gateway</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg,#0a0a0a)' }}>{fmt(gatewayBal)} USDC</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border,#cecdc3)' }}>
          <button onClick={() => setTab('deposit')} style={{ flex: 1, padding: '10px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'transparent', color: tab === 'deposit' ? 'var(--fg,#0a0a0a)' : 'var(--muted,#6b6862)', borderBottom: `2px solid ${tab === 'deposit' ? 'var(--accent,#7c9a6d)' : 'transparent'}`, fontFamily: 'inherit' }}>Deposit</button>
          <button onClick={() => setTab('withdraw')} style={{ flex: 1, padding: '10px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'transparent', color: tab === 'withdraw' ? 'var(--fg,#0a0a0a)' : 'var(--muted,#6b6862)', borderBottom: `2px solid ${tab === 'withdraw' ? 'var(--accent,#7c9a6d)' : 'transparent'}`, fontFamily: 'inherit' }}>Withdraw</button>
        </div>
        <label style={{ fontSize: 17, fontWeight: 600, color: 'var(--muted,#6b6862)', marginBottom: 8, display: 'block' }}>Amount (USDC)</label>
        <input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={{ padding: '14px 16px', fontSize: 18, borderRadius: 12, border: '1px solid var(--border,#cecdc3)', background: 'transparent', color: 'var(--fg,#0a0a0a)', width: '100%', fontFamily: 'inherit', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
        <button onClick={tab === 'deposit' ? doDeposit : doWithdraw} disabled={busy} style={{ width: '100%', padding: '16px 28px', fontSize: 20, fontWeight: 600, borderRadius: 12, cursor: busy ? 'default' : 'pointer', border: 'none', background: 'var(--accent,#7c9a6d)', color: 'var(--bg,#f4f4f0)', fontFamily: 'inherit', opacity: busy ? 0.35 : 1 }}>
          {busy ? status : tab === 'deposit' ? 'Deposit' : 'Withdraw'}
        </button>
        {status && <div style={{ fontSize: 12, color: status.includes('Failed') ? '#dc2626' : 'var(--accent,#7c9a6d)', wordBreak: 'break-all', marginTop: 12 }}>{status}</div>}
      </div>
    </div>
  )
}

export function WalletButton() {
  const { connect, signIn, busy, status, error } = useNibgateConnect()
  const { address, chainId, isConnected } = useAccount()
  const activeChainId = useChainId()
  const { disconnect } = useDisconnect()
  const displayAddress = isConnected ? address : undefined
  const isWalletConnected = isConnected
  const connectedChainId = getConnectedChainId(chainId, activeChainId)
  const isWrongChain = isWalletConnected && !isArcTestnetChainId(connectedChainId)
  const [sessionAddress, setSessionAddress] = useState<string | null>(null)
  const sessionAddr = isHexAddress(sessionAddress) ? sessionAddress : undefined
  const effectiveAddress = displayAddress ?? sessionAddr
  const isConnectedAny = isWalletConnected || Boolean(sessionAddr)
  const busyRef = useRef(busy)
  const walletConnectedRef = useRef(isWalletConnected)
  const sessionAddrRef = useRef(sessionAddr)
  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => { walletConnectedRef.current = isWalletConnected }, [isWalletConnected])
  useEffect(() => { sessionAddrRef.current = sessionAddr }, [sessionAddr])

  const { data: nativeBalance } = useBalance({
    address: displayAddress,
    chainId: arcTestnet.id,
  })

  const [selectedToken, setSelectedToken] = useState<'native' | 'gateway'>('native')
  const [gatewayBalance, setGatewayBalance] = useState(0)
  const [bridgeOpen, setBridgeOpen] = useState(false)

  const nativeNum = nativeBalance ? Number(nativeBalance.value) / 10 ** nativeBalance.decimals : 0
  const nativeDisplay = fmt(nativeNum) + ' USDC'
  const gatewayDisplay = fmt(gatewayBalance) + ' USDC'
  const displayBalance = selectedToken === 'native' ? nativeDisplay : gatewayDisplay

  useEffect(() => {
    if (!isWalletConnected || !displayAddress || isWrongChain) return
    gatewayClient.readContract({
      address: GATEWAY_WALLET_ADDRESS, abi: GATEWAY_ABI, functionName: 'availableBalance',
      args: [USDC_ADDRESS, displayAddress],
    }).then(raw => {
      setGatewayBalance(Number(raw) / 1_000_000)
    }).catch(() => {
      setGatewayBalance(0)
    })
  }, [isWalletConnected, displayAddress, isWrongChain])

  useEffect(() => {
    let cancelled = false
    const refresh = () => getHubSessionAddress().then((addr) => { if (!cancelled) setSessionAddress(addr) })
    refresh()
    const clear = () => setSessionAddress(null)
    window.addEventListener(HUB_SESSION_CLEARED_EVENT, clear)
    window.addEventListener(HUB_SESSION_UPDATED_EVENT, refresh)
    return () => { cancelled = true; window.removeEventListener(HUB_SESSION_CLEARED_EVENT, clear); window.removeEventListener(HUB_SESSION_UPDATED_EVENT, refresh) }
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest('button, a')
      if (!t) return

      if (t.hasAttribute('data-wallet-connect')) {
        e.preventDefault()
        if (t.classList.contains('nibgate-header-mobile-cta')) return
        if (busyRef.current) return
        if (walletConnectedRef.current && !sessionAddrRef.current) {
          void signIn()
        } else if (t.getAttribute('data-connected') !== 'true') {
          void connect()
        }
      } else if (t.hasAttribute('data-wallet-disconnect')) {
        e.preventDefault()
        try { fetch('/api/auth/logout', { method: 'POST' }) } catch {}
        window.dispatchEvent(new Event(HUB_SESSION_CLEARED_EVENT))
        setSessionAddress(null)
        disconnect()
      } else if (t.hasAttribute('data-token-select')) {
        e.preventDefault()
        const token = t.getAttribute('data-token-select') || 'native'
        setSelectedToken(token as 'native' | 'gateway')
      } else if (t.hasAttribute('data-bridge-open')) {
        e.preventDefault()
        setBridgeOpen(true)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [connect, signIn, disconnect])

  return (
    <>
      <div className="nibgate-wallet-container" data-balance-container>
        <button type="button" className="nibgate-header-login" data-balance-text data-selected-token={selectedToken} data-native={nativeDisplay} data-gateway={gatewayDisplay} style={{ display: isWalletConnected ? 'flex' : 'none' }}>
          {displayBalance}
        </button>
        <div className="nibgate-wallet-dropdown" data-balance-dropdown style={{ display: 'none' }}>
          <button type="button" className="dropdown-item" data-token-select="native" style={{ fontWeight: 500, color: selectedToken === 'native' ? 'var(--nib-teal)' : '' }}>{arcTestnet.nativeCurrency.symbol}</button>
          <button type="button" className="dropdown-item" data-token-select="gateway" style={{ fontWeight: 500, color: selectedToken === 'gateway' ? 'var(--nib-teal)' : '' }}>Gateway</button>
          <button type="button" className="dropdown-item" data-bridge-open style={{ fontWeight: 500 }}>Bridge</button>
        </div>
      </div>

      <div className="nibgate-wallet-container" data-wallet-container>
        <button className="nibgate-header-cta" type="button" data-wallet-connect data-connected={isConnectedAny && effectiveAddress ? 'true' : 'false'} data-address={effectiveAddress || ''} style={{ display: 'flex' }}>
          {status === 'connecting' ? 'Connecting…' : status === 'signing' ? 'Sign in…' : status === 'error' ? 'Sign in' : isConnectedAny && effectiveAddress ? shortAddress(effectiveAddress) : 'Connect wallet'}
        </button>
        {status === 'error' && error ? <span className="nibgate-wallet-error">{error}</span> : null}
        {isConnectedAny && effectiveAddress ? (
          <div className="nibgate-wallet-dropdown" data-wallet-dropdown style={{ display: 'none' }}>
            <Link href="/dashboard" className="dropdown-item">Dashboard</Link>
            <button type="button" className="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
          </div>
        ) : null}
      </div>

      {bridgeOpen && displayAddress && (
        <GatewayBridgeModal address={displayAddress} gatewayBal={gatewayBalance} walletBal={nativeNum} onClose={() => setBridgeOpen(false)} />
      )}
    </>
  )
}

export function WalletButtonMobile() {
  const { connect, signIn, busy, status, error } = useNibgateConnect()
  const { address, chainId, isConnected } = useAccount()
  const activeChainId = useChainId()
  const displayAddress = isConnected ? address : undefined
  const isWalletConnected = isConnected
  const connectedChainId = getConnectedChainId(chainId, activeChainId)
  const isWrongChain = isWalletConnected && !isArcTestnetChainId(connectedChainId)
  const [sessionAddress, setSessionAddress] = useState<string | null>(null)
  const sessionAddr = isHexAddress(sessionAddress) ? sessionAddress : undefined
  const effectiveAddress = displayAddress ?? sessionAddr
  const isConnectedAny = isWalletConnected || Boolean(sessionAddr)

  const { data: nativeBalance } = useBalance({
    address: displayAddress,
    chainId: arcTestnet.id,
  })

  const [selectedToken, setSelectedToken] = useState<'native' | 'gateway'>('native')
  const [gatewayBalance, setGatewayBalance] = useState(0)
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<'balance' | 'wallet' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openDropdown) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenDropdown(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [openDropdown])

  const nativeNum = nativeBalance ? Number(nativeBalance.value) / 10 ** nativeBalance.decimals : 0
  const nativeDisplay = fmt(nativeNum) + ' USDC'
  const gatewayDisplay = fmt(gatewayBalance) + ' USDC'
  const displayBalance = selectedToken === 'native' ? nativeDisplay : gatewayDisplay

  useEffect(() => {
    if (!isWalletConnected || !displayAddress || isWrongChain) return
    gatewayClient.readContract({
      address: GATEWAY_WALLET_ADDRESS, abi: GATEWAY_ABI, functionName: 'availableBalance',
      args: [USDC_ADDRESS, displayAddress],
    }).then(raw => {
      setGatewayBalance(Number(raw) / 1_000_000)
    }).catch(() => {
      setGatewayBalance(0)
    })
  }, [isWalletConnected, displayAddress, isWrongChain])

  useEffect(() => {
    let cancelled = false
    const refresh = () => getHubSessionAddress().then((addr) => { if (!cancelled) setSessionAddress(addr) })
    refresh()
    const clear = () => setSessionAddress(null)
    window.addEventListener(HUB_SESSION_CLEARED_EVENT, clear)
    window.addEventListener(HUB_SESSION_UPDATED_EVENT, refresh)
    return () => { cancelled = true; window.removeEventListener(HUB_SESSION_CLEARED_EVENT, clear); window.removeEventListener(HUB_SESSION_UPDATED_EVENT, refresh) }
  }, [])

  const chevron = <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 8 }}>▾</span>

  return (
    <div ref={rootRef} style={{ width: '100%' }}>
      <div className="nibgate-wallet-container" data-balance-container style={{ width: '100%' }}>
        <button type="button" className="nibgate-header-mobile-login" onClick={() => setOpenDropdown(openDropdown === 'balance' ? null : 'balance')} style={{ width: '100%', display: isWalletConnected ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center' }} data-balance-text data-selected-token={selectedToken} data-native={nativeDisplay} data-gateway={gatewayDisplay}>
          {displayBalance}
          {isWalletConnected ? chevron : null}
        </button>
        <div className="nibgate-wallet-dropdown mobile-dropdown" data-balance-dropdown style={{ display: openDropdown === 'balance' ? 'flex' : 'none' }}>
          <button type="button" className="dropdown-item" data-token-select="native" onClick={() => setOpenDropdown(null)} style={{ fontWeight: 500, color: selectedToken === 'native' ? 'var(--nib-teal)' : '' }}>{arcTestnet.nativeCurrency.symbol}</button>
          <button type="button" className="dropdown-item" data-token-select="gateway" onClick={() => setOpenDropdown(null)} style={{ fontWeight: 500, color: selectedToken === 'gateway' ? 'var(--nib-teal)' : '' }}>Gateway</button>
          <button type="button" className="dropdown-item" data-bridge-open onClick={() => setOpenDropdown(null)} style={{ fontWeight: 500 }}>Bridge</button>
        </div>
      </div>

      <div className="nibgate-wallet-container" data-wallet-container style={{ width: '100%' }}>
        <button
          className="nibgate-header-mobile-cta"
          type="button"
          data-wallet-connect
          data-connected={isConnectedAny && effectiveAddress ? 'true' : 'false'}
          data-address={effectiveAddress || ''}
          onClick={() => {
            if (busy) return
            if (isWalletConnected && !sessionAddr) { void signIn(); return }
            if (isConnectedAny && effectiveAddress) { setOpenDropdown(openDropdown === 'wallet' ? null : 'wallet'); return }
            void connect()
          }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {status === 'connecting' ? 'Connecting…' : status === 'signing' ? 'Sign in…' : status === 'error' ? 'Sign in' : isConnectedAny && effectiveAddress ? shortAddress(effectiveAddress) : 'Connect wallet'}
          {isConnectedAny && effectiveAddress ? chevron : null}
        </button>
        {status === 'error' && error ? <span className="nibgate-wallet-error">{error}</span> : null}
        {isConnectedAny && effectiveAddress ? (
          <div className="nibgate-wallet-dropdown mobile-dropdown" data-wallet-dropdown style={{ display: openDropdown === 'wallet' ? 'flex' : 'none' }}>
            <Link href="/dashboard" className="dropdown-item" onClick={() => setOpenDropdown(null)}>Dashboard</Link>
            <button type="button" className="dropdown-item dropdown-disconnect" data-wallet-disconnect onClick={() => setOpenDropdown(null)}>Disconnect</button>
          </div>
        ) : null}
      </div>

      {bridgeOpen && displayAddress && (
        <GatewayBridgeModal address={displayAddress} gatewayBal={gatewayBalance} walletBal={nativeNum} onClose={() => setBridgeOpen(false)} />
      )}
    </div>
  )
}
