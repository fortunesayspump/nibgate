'use client'
import { useEffect, useState } from 'react'
import { useGatewayTransfer } from './useGatewayTransfer.js'
import { activeChain } from '../chain.js'

const ARC_RPC = activeChain().rpcUrl
const USDC = '0x3600000000000000000000000000000000000000'
const BALANCE_OF = '0x70a08231'

function shortAddress(a) {
  return a ? a.slice(0, 6) + '...' + a.slice(-4) : ''
}

export function GatewayWalletUI({ address, gatewayBalanceUrl, onClose }) {
  const [tab, setTab] = useState('deposit')
  const [amount, setAmount] = useState('')
  const [walletBal, setWalletBal] = useState('—')
  const [gwBal, setGwBal] = useState('—')
  const [txMsg, setTxMsg] = useState('')
  const { run, reset, repairConnection, busy, status, transfer } = useGatewayTransfer(address)
  const finished = transfer?.status === 'confirmed' || transfer?.status === 'reverted'
  const pending = transfer?.status === 'pending'
  const activeTab = transfer?.kind ?? tab
  const canCancel = pending && !transfer.approvalHash && !transfer.transferHash && !transfer.submitting

  useEffect(() => {
    if (!address) return
    fetchWalletUsdc(address)
    fetchGwBal(address)
    const t = setInterval(() => {
      fetchWalletUsdc(address)
      fetchGwBal(address)
    }, 15000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  async function fetchWalletUsdc(addr) {
    try {
      const r = await fetch(ARC_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC, data: BALANCE_OF + addr.slice(2).padStart(64, '0') }, 'latest'],
          id: 1,
        }),
      })
      const d = await r.json()
      const bal = d.result ? parseInt(d.result, 16) / 1e6 : 0
      setWalletBal(bal.toFixed(2) + ' USDC')
    } catch {
      setWalletBal('—')
    }
  }

  async function fetchGwBal(addr) {
    if (!gatewayBalanceUrl) {
      setGwBal('—')
      return
    }
    try {
      const r = await fetch(gatewayBalanceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      })
      const data = await r.json()
      setGwBal(data?.balance || '0.00 USDC')
    } catch {
      setGwBal('—')
    }
  }

  async function doDeposit() {
    setTxMsg('')
    if (finished) { await reset(); setAmount(''); return }
    const result = await run(pending ? transfer.kind : 'deposit', amount)
    if (result?.status === 'confirmed') {
      void fetchWalletUsdc(result.address)
      void fetchGwBal(result.address)
    }
  }

  const inputStyle = {
    padding: '14px 16px',
    fontSize: 18,
    borderRadius: 12,
    border: '1px solid var(--border, #cecdc3)',
    background: 'transparent',
    color: 'var(--fg, #0a0a0a)',
    width: '100%',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 16,
  }

  const cardStyle = {
    flex: 1,
    background: 'var(--bg, #f4f4f0)',
    border: '1px solid var(--border, #cecdc3)',
    borderRadius: 12,
    padding: 16,
  }

  const tabStyle = (active) => ({
    flex: 1,
    padding: '10px 0',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: active ? 'var(--fg, #0a0a0a)' : 'var(--muted, #6b6862)',
    borderBottom: active ? '2px solid var(--accent, #7c9a6d)' : '2px solid transparent',
    fontFamily: 'inherit',
  })

  const doWithdraw = async () => {
    setTxMsg('Withdraw via admin dashboard')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'var(--font-content, inherit)',
        color: 'var(--fg, #0a0a0a)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose?.() }}
    >
      <div
        style={{
          background: 'var(--bg, #f4f4f0)',
          borderRadius: 16,
          maxWidth: 540,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            zIndex: 20,
            background: 'none',
            border: 'none',
            fontSize: 28,
            cursor: 'pointer',
            color: 'var(--muted, #6b6862)',
            fontFamily: 'inherit',
            lineHeight: 1,
          }}
        >
          ×
        </button>
        <div style={{ padding: 28 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, color: 'var(--muted, #6b6862)' }}>
                  {shortAddress(address)}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent, #7c9a6d)' }}>Connected</span>
              </div>
              <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 24, fontWeight: 700 }}>
                {walletBal}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted, #6b6862)', marginBottom: 4, letterSpacing: '.02em' }}>Gateway</div>
              <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 24, fontWeight: 700 }}>
                {gwBal}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border, #cecdc3)' }}>
            <button type="button" disabled={busy || Boolean(pending)} style={tabStyle(activeTab === 'deposit')} onClick={() => setTab('deposit')}>Deposit</button>
            <button type="button" disabled={busy || Boolean(pending)} style={tabStyle(activeTab === 'withdraw')} onClick={() => setTab('withdraw')}>Withdraw</button>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--muted, #6b6862)', marginBottom: 8 }}>Amount (USDC)</div>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            disabled={busy || Boolean(transfer)}
            value={transfer?.amount ?? amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            disabled={busy}
            onClick={finished || pending || tab === 'deposit' ? doDeposit : doWithdraw}
            style={{
              width: '100%',
              padding: '16px 28px',
              fontSize: 20,
              fontWeight: 600,
              borderRadius: 12,
              cursor: busy ? 'default' : 'pointer',
              border: 'none',
              background: 'var(--accent, #7c9a6d)',
              color: 'var(--bg, #f4f4f0)',
              fontFamily: 'inherit',
              opacity: busy ? 0.6 : 1,
              lineHeight: 1,
            }}
          >
            {busy ? 'Processing…' : finished ? 'Start a new transfer' : pending ? `Resume ${transfer.kind}` : tab === 'deposit' ? 'Deposit' : 'Withdraw to your wallet'}
          </button>
          <button type="button" disabled={busy} onClick={() => { setTxMsg(''); void repairConnection() }} style={{ marginTop: 12 }} title="Requests the official Arc RPC in your connected wallet and checks its connection. Saved transactions are preserved.">Repair wallet connection</button>
          {canCancel && <button type="button" disabled={busy} onClick={() => void reset()} style={{ marginTop: 12 }}>Cancel and change amount</button>}
          {transfer?.approvalHash && <div style={{ fontSize: 12, wordBreak: 'break-all', marginTop: 12 }}>Approval: {transfer.approvalHash}</div>}
          {transfer?.transferHash && <div style={{ fontSize: 12, wordBreak: 'break-all', marginTop: 12 }}>Transaction: {transfer.transferHash}</div>}
          {(txMsg || status) && (
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, color: 'var(--muted, #6b6862)', wordBreak: 'break-all', marginTop: 12 }}>
              {txMsg || status}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
