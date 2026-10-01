import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { preflightTransfer, ARC_USDC } from '../src/server/fee-wallet.js'
import { getPaymentErrorMessage, PAYMENT_ERRORS } from '../../wallet/src/errors.js'

const SELLER = '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12'
const PAYER = '0x1111111111111111111111111111111111111111'
const RESOURCE = { id: 'pre-1', title: 'Post', price: '1.5', currency: 'USDC', recipient: SELLER }

const servers = []
afterEach(async () => {
  while (servers.length) {
    const s = servers.pop()
    await new Promise((resolve) => s.close(resolve))
  }
})

// balanceOf(address) selector + the ABI-encoded return value.
const BALANCE_OF = '0x70a08231'

// eth_call stub that answers balanceOf for PAYER with `balanceUsdc`. `failCall`
// makes every eth_call error, to prove an unknown balance does not block pay.
function startBalanceRpc({ balanceUsdc = 10, failCall = false } = {}) {
  const balanceWei = BigInt(Math.round(balanceUsdc * 1e6))
  const balanceHex = '0x' + balanceWei.toString(16).padStart(64, '0')

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let params = []
      let id = 1
      let method = ''
      try {
        const json = JSON.parse(body || '{}')
        params = json.params || []
        id = json.id
        method = json.method || ''
      } catch {}

      let result = null
      if (method === 'eth_chainId') result = '0x4cef52'
      if (method === 'eth_blockNumber') result = '0x1'
      if (method === 'eth_call') {
        // viem encodes balanceOf's argument in calldata (params[0].data), not as
        // a structured `args` entry: 0x70a08231 + 24 zero pad chars + the
        // 40-char address.
        const data = params[0]?.data || ''
        const arg = '0x' + data.slice(34, 74)
        if (!failCall && data.startsWith(BALANCE_OF) && arg === PAYER.toLowerCase()) {
          result = balanceHex
        }
      }

      if (failCall && method === 'eth_call') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'execution reverted' } }))
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }))
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      servers.push(server)
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

describe('preflightTransfer', () => {
  it('passes and returns the payTo the wallet must broadcast to', async () => {
    const rpcUrl = await startBalanceRpc({ balanceUsdc: 10 })
    const result = await preflightTransfer(RESOURCE, { payer: PAYER, options: { rpcUrl, hosted: false } })

    expect(result.ok).toBe(true)
    expect(result.payTo.toLowerCase()).toBe(SELLER.toLowerCase())
    expect(result.amount).toBe(1.5)
    expect(result.currency).toBe('USDC')
    expect(result.payerBalance).toBe(10)
  })

  // The silent killer: an unresolvable fee wallet produces a valid-looking
  // address that can never receive, which used to fail only AFTER broadcast.
  it('fails closed when no payment address resolves', async () => {
    const rpcUrl = await startBalanceRpc()
    const result = await preflightTransfer(
      { ...RESOURCE, recipient: '', payTo: '' },
      { payer: PAYER, options: { rpcUrl, hosted: true, recipient: '' } }
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('preflight-payto-unresolved')
  })

  it('rejects a payer with insufficient USDC before any transfer is broadcast', async () => {
    const rpcUrl = await startBalanceRpc({ balanceUsdc: 0.5 })
    const result = await preflightTransfer(RESOURCE, { payer: PAYER, options: { rpcUrl, hosted: false } })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('preflight-insufficient-balance')
    expect(result.balance).toBeCloseTo(0.5)
    expect(result.amount).toBe(1.5)
  })

  // An amount that disagrees with the challenge would broadcast a transfer the
  // verifier rejects (it requires value >= price).
  it('rejects an amount that does not match the price', async () => {
    const rpcUrl = await startBalanceRpc()
    const result = await preflightTransfer(RESOURCE, { payer: PAYER, amount: 0.01, options: { rpcUrl, hosted: false } })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('preflight-amount-mismatch')
  })

  it('rejects a free/unpriced resource', async () => {
    const rpcUrl = await startBalanceRpc()
    const result = await preflightTransfer({ ...RESOURCE, price: '0' }, { payer: PAYER, options: { rpcUrl, hosted: false } })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('preflight-not-payable')
  })

  it('rejects a malformed payer address', async () => {
    const rpcUrl = await startBalanceRpc()
    const result = await preflightTransfer(RESOURCE, { payer: 'not-an-address', options: { rpcUrl, hosted: false } })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('preflight-invalid-payer')
  })

  // An unreadable balance must not permanently block payments; the wallet shows
  // its own balance and will refuse if too low.
  it('allows the payment but reports balance as unknown when the RPC call fails', async () => {
    const rpcUrl = await startBalanceRpc({ failCall: true })
    const result = await preflightTransfer(RESOURCE, { payer: PAYER, options: { rpcUrl, hosted: false } })

    expect(result.ok).toBe(true)
    expect(result.balanceKnown).toBe(false)
    expect(result.reason).toBe('preflight-balance-unavailable')
    expect(result.payTo.toLowerCase()).toBe(SELLER.toLowerCase())
  })
})

describe('direct-rail error copy', () => {
  // These reasons all mean the transfer may already be on-chain. Telling the
  // user to retry risks a double charge, and "check your balance" was wrong.
  it('never tells the user to check their balance', () => {
    expect(PAYMENT_ERRORS.default.toLowerCase()).not.toContain('balance')
    for (const friendly of Object.values(PAYMENT_ERRORS)) {
      expect(friendly.toLowerCase()).not.toContain('check your balance')
    }
  })

  it('warns against paying again when the proof is missing', () => {
    const msg = getPaymentErrorMessage({ reason: 'transfer-ownership-proof-required' })
    expect(msg).toContain('Do not pay again')
    expect(msg).toContain('transaction hash')
  })

  // The live failure sent error:"Transfer ownership check failed" plus a
  // machine reason. Mapping only the summary fell through to the default.
  it('prefers the machine reason over the generic summary', () => {
    const msg = getPaymentErrorMessage({
      reason: 'transfer-owner-mismatch',
      error: 'Transfer ownership check failed',
    })
    expect(msg).toBe(PAYMENT_ERRORS['transfer-owner-mismatch'])
    expect(msg).not.toBe(PAYMENT_ERRORS.default)
  })

  it('maps the other post-broadcast reasons', () => {
    for (const reason of ['transfer-owner-invalid', 'txhash-claimed-elsewhere', 'claim-registry-unreachable']) {
      expect(getPaymentErrorMessage({ reason })).toBe(PAYMENT_ERRORS[reason])
    }
  })

  // A preflight rejection happens BEFORE any broadcast, so the copy must say
  // nothing was charged — the post-broadcast "don't pay again" wording would
  // wrongly alarm someone whose wallet was never debited.
  it('tells the user nothing was charged for preflight rejections', () => {
    for (const reason of Object.keys(PAYMENT_ERRORS).filter((k) => k.startsWith('preflight-'))) {
      const msg = getPaymentErrorMessage({ reason })
      expect(msg, reason).toMatch(/nothing was charged/i)
      expect(msg, reason).not.toMatch(/do not pay again/i)
    }
  })

  it('distinguishes pre-broadcast from post-broadcast refusals', () => {
    expect(getPaymentErrorMessage({ reason: 'preflight-insufficient-balance' }))
      .not.toBe(getPaymentErrorMessage({ reason: 'transfer-owner-mismatch' }))
  })

  it('still maps gateway reasons that are safe to retry', () => {
    expect(getPaymentErrorMessage({ reason: 'insufficient_balance' })).toBe(PAYMENT_ERRORS.insufficient_balance)
    expect(getPaymentErrorMessage({ reason: 'expired_challenge' })).toBe(PAYMENT_ERRORS.expired_challenge)
  })
})

describe('preflight vs verifier agreement', () => {
  it('uses the same USDC contract and 6-decimal scaling as the verifier', async () => {
    const rpcUrl = await startBalanceRpc({ balanceUsdc: 1.5 })
    const result = await preflightTransfer(RESOURCE, { payer: PAYER, options: { rpcUrl, hosted: false } })

    // Exactly-enough balance must pass: off-by-one here would either reject
    // affordable payments or wave through ones the verifier will reject.
    expect(result.ok).toBe(true)
    expect(ARC_USDC).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})

// ── Client-side gate ────────────────────────────────────────────────────
// Mirrors preflightUrlFor/runDirectPreflight from packages/wallet/src/react/unlock.jsx.
// Kept in sync by behaviour: the URL must be derived from the access URL so
// every surface (hub /hub/pay, nibshare /nibshare/:slug/access) is covered
// without per-surface config.
function preflightUrlFor(accessUrl) {
  if (!accessUrl || typeof accessUrl !== 'string') return ''
  const [pathPart, query = ''] = accessUrl.split('?')
  const trimmed = pathPart.replace(/\/+$/, '')
  if (trimmed.split('/').filter(Boolean).length < 2) return ''
  const segments = trimmed.split('/')
  segments[segments.length - 1] = 'preflight'
  return `${segments.join('/')}${query ? `?${query}` : ''}`
}

async function runDirectPreflight({ accessUrl, resource, payer, amount, rail, fetchImpl }) {
  const url = preflightUrlFor(accessUrl)
  if (!url || typeof fetchImpl !== 'function') return { proceed: true, reason: 'preflight-skipped' }
  try {
    const res = await fetchImpl(url, { method: 'POST' })
    const body = await res.json().catch(() => null)
    if (!body || typeof body !== 'object') return { proceed: true, reason: 'preflight-unparseable' }
    if (body.proceedAnyway || body.needed === false) return { proceed: true, reason: body.reason || 'preflight-skipped' }
    if (!body.ok && body.reason) return { proceed: false, reason: body.reason, hint: body.hint, balance: body.balance, price: body.amount }
    if (!body.ok) return { proceed: true, reason: 'preflight-soft-fail' }
    return { proceed: true, payTo: body.payTo || '', amount: body.amount, currency: body.currency }
  } catch {
    return { proceed: true, reason: 'preflight-unreachable' }
  }
}

describe('preflight URL derivation', () => {
  it('maps the hub access route to the hub preflight route', () => {
    expect(preflightUrlFor('https://api.nibgate.xyz/hub/pay')).toBe('https://api.nibgate.xyz/hub/preflight')
  })

  it('maps a nibshare access route to its preflight route, keeping slug and query', () => {
    expect(preflightUrlFor('https://api.nibgate.xyz/nibshare/abc/access?rail=transfer&path=/x'))
      .toBe('https://api.nibgate.xyz/nibshare/abc/preflight?rail=transfer&path=/x')
  })

  it('returns empty for unusable input so the gate is skipped, not crashed', () => {
    expect(preflightUrlFor('')).toBe('')
    expect(preflightUrlFor(null)).toBe('')
    expect(preflightUrlFor('/pay')).toBe('')
  })
})

describe('direct-rail preflight gate', () => {
  const args = { resource: { id: 'p', path: '/p' }, payer: PAYER, amount: 1.5, rail: 'transfer' }

  it('aborts on an explicit rejection reason', async () => {
    const fetchImpl = async () => ({ json: async () => ({ ok: false, needed: true, reason: 'preflight-insufficient-balance', balance: 0.2, amount: 1.5 }) })
    const result = await runDirectPreflight({ ...args, accessUrl: 'https://api/hub/pay', fetchImpl })

    expect(result.proceed).toBe(false)
    expect(result.reason).toBe('preflight-insufficient-balance')
  })

  it('adopts the hub-resolved payTo so the broadcast matches the verifier', async () => {
    const feeWallet = '0x9999999999999999999999999999999999999999'
    const fetchImpl = async () => ({ json: async () => ({ ok: true, needed: true, payTo: feeWallet, amount: 1.5 }) })
    const result = await runDirectPreflight({ ...args, accessUrl: 'https://api/hub/pay', fetchImpl })

    expect(result.proceed).toBe(true)
    expect(result.payTo).toBe(feeWallet)
  })

  // Fail-open is deliberate: a preflight bug must never take down every unlock.
  it('proceeds when preflight is unreachable', async () => {
    const fetchImpl = async () => { throw new Error('network down') }
    const result = await runDirectPreflight({ ...args, accessUrl: 'https://api/hub/pay', fetchImpl })

    expect(result.proceed).toBe(true)
    expect(result.reason).toBe('preflight-unreachable')
  })

  it('proceeds when the server says the check is unavailable', async () => {
    const fetchImpl = async () => ({ json: async () => ({ ok: true, needed: false, proceedAnyway: true, reason: 'preflight-unavailable' }) })
    const result = await runDirectPreflight({ ...args, accessUrl: 'https://api/hub/pay', fetchImpl })

    expect(result.proceed).toBe(true)
  })

  it('proceeds when the response is not JSON', async () => {
    const fetchImpl = async () => ({ json: async () => { throw new Error('not json') } })
    const result = await runDirectPreflight({ ...args, accessUrl: 'https://api/hub/pay', fetchImpl })

    expect(result.proceed).toBe(true)
    expect(result.reason).toBe('preflight-unparseable')
  })

  // A rejection with no machine reason is not actionable — don't block on it.
  it('proceeds on a rejection that carries no reason', async () => {
    const fetchImpl = async () => ({ json: async () => ({ ok: false, error: 'boom' }) })
    const result = await runDirectPreflight({ ...args, accessUrl: 'https://api/hub/pay', fetchImpl })

    expect(result.proceed).toBe(true)
    expect(result.reason).toBe('preflight-soft-fail')
  })
})