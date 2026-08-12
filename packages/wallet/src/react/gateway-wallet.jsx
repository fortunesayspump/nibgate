import { useEffect, useState } from 'react'
import { switchToArcNetwork } from '../network.js'
import { getWalletErrorMessage, isWalletRejection } from '../errors.js'
import { ARC_TESTNET } from '../chain.js'

const ARC_RPC = ARC_TESTNET.rpcUrl
const USDC = '0x3600000000000000000000000000000000000000'
const GATEWAY = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
const SEL_APPROVE = '0x095ea7b3'
const SEL_DEPOSIT = '0x47e7ef24'
const BALANCE_OF = '0x70a08231'

function parse6(v) {
  const [w = '0', f = ''] = String(v).split('.')
  return BigInt(w + f.padEnd(6, '0').slice(0, 6))
}

function addr32(a) {
  return '000000000000000000000000' + a.slice(2)
}

function shortAddress(a) {
  return a ? a.slice(0, 6) + '...' + a.slice(-4) : ''
}

export function GatewayWalletUI({ address, gatewayBalanceUrl, onClose }) {
  const [tab, setTab] = useState('deposit')
  const [amount, setAmount] = useState('')
  const [walletBal, setWalletBal] = useState('—')
  const [gwBal, setGwBal] = useState('—')
  const [txMsg, setTxMsg] = useState('')
  const [busy, setBusy] = useState(false)

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

  async function switchToArc() {
    try {
      await switchToArcNetwork(window.ethereum)
    } catch (error) {
      if (isWalletRejection(error)) throw error
    }
  }

  async function doDeposit() {
    if (!window.ethereum) {
      setTxMsg('No wallet found')
      return
    }
    if (busy) return
    try {
      await switchToArc()
    } catch {}
    const amt = amount
    if (!amt || Number(amt) <= 0) {
      setTxMsg('Enter an amount')
      return
    }
    setBusy(true)
    setTxMsg('')
    try {
      const accts = await window.ethereum.request({ method: 'eth_accounts' })
      const addr = accts?.[0]
      if (!addr) {
        setTxMsg('Connect wallet')
        setBusy(false)
        return
      }
      const val = parse6(amt).toString(16)
      setTxMsg('Approving…')
      const approveTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: addr, to: USDC, data: SEL_APPROVE + addr32(GATEWAY) + val.padStart(64, '0') }],
      })
      setTxMsg('Approved: ' + approveTx.slice(0, 10) + '…')
      const depositTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: addr, to: GATEWAY, data: SEL_DEPOSIT + addr32(USDC) + val.padStart(64, '0') }],
      })
      setTxMsg('Deposited: ' + depositTx.slice(0, 10) + '…')
      fetchWalletUsdc(addr)
      fetchGwBal(addr)
    } catch (e) {
      setTxMsg(getWalletErrorMessage(e) || 'Deposit failed')
    }
    setBusy(false)
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
            <button type="button" style={tabStyle(tab === 'deposit')} onClick={() => setTab('deposit')}>Deposit</button>
            <button type="button" style={tabStyle(tab === 'withdraw')} onClick={() => setTab('withdraw')}>Withdraw</button>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--muted, #6b6862)', marginBottom: 8 }}>Amount (USDC)</div>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            disabled={busy}
            onClick={tab === 'deposit' ? doDeposit : doWithdraw}
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
            {busy ? 'Processing…' : tab === 'deposit' ? 'Deposit' : 'Withdraw to your wallet'}
          </button>
          {txMsg && (
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, color: 'var(--muted, #6b6862)', wordBreak: 'break-all', marginTop: 12 }}>
              {txMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
