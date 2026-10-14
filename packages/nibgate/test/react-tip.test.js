import { createRequire } from 'node:module'
const walletRequire = createRequire(new URL('../../wallet/package.json', import.meta.url))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ states: [], account: '0x1111111111111111111111111111111111111111', send: vi.fn(), wait: vi.fn(), rpc: vi.fn(), onPaid: vi.fn() }))
vi.doMock(walletRequire.resolve('react'), () => ({ useCallback: (fn) => fn, useEffect: (fn) => fn(), useRef: (current) => ({ current }), useState: (initial) => { const state = { value: initial }; mocks.states.push(state); return [initial, (value) => { state.value = value }] } }))
vi.doMock(walletRequire.resolve('@reown/appkit/react'), () => ({ useAppKit: () => ({ open: vi.fn() }), useAppKitAccount: () => ({ address: mocks.account, isConnected: true }), useAppKitProvider: () => ({ walletProvider: { request: mocks.rpc } }) }))
vi.doMock(walletRequire.resolve('viem').replace('/_cjs/', '/_esm/'), async (original) => ({ ...(await original()), createWalletClient: () => ({ sendTransaction: mocks.send }), createPublicClient: () => ({ readContract: async () => 10000000n, waitForTransactionReceipt: mocks.wait }) }))
const { useNibgateTip } = await import('../../wallet/src/react/tip.jsx')
import { activeChain } from '../../wallet/src/chain.js'
const recipient = '0x2222222222222222222222222222222222222222'
const box = '0x3333333333333333333333333333333333333333'
const txHash = `0x${'ab'.repeat(32)}`
const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
const resource = { id: 'post-1', url: 'https://creator.example/post', title: 'Post' }
const confirmedReceipt = (overrides = {}) => ({ type: 'tip', paymentId: txHash, txHash, amount: .25, currency: 'USDC', ...overrides })
const heldReceipt = (overrides = {}) => ({ id: 'held-1', status: 'held', paymentId: txHash, txHash, amount: .25, currency: 'USDC', ...overrides })
function hook(options = {}) { return useNibgateTip({ resource, recipient, amount: '.25', apiBase: 'https://hub.test', onPaid: mocks.onPaid, ...options }) }
function setupFetch({ held = false, verify = () => ok({ success: true, receipt: confirmedReceipt(), holdStatus: 'held', tip: heldReceipt() }) } = {}) {
  const fetchMock = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body)
    if (String(url).endsWith('/challenge')) return ok({ success: true, payee: box, accepts: [{ network: activeChain().caip2 }] })
    if (String(url).endsWith('/hold') && !body.txHash) return ok({ success: true, box, accepts: [{ payTo: box, network: activeChain().caip2 }] })
    return verify(url, body)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
beforeEach(() => { mocks.states = []; mocks.send.mockReset().mockResolvedValue(txHash); mocks.wait.mockReset().mockResolvedValue({ status: 'success', transactionHash: txHash }); mocks.rpc.mockReset().mockImplementation(async () => activeChain().chainIdHex); mocks.onPaid.mockReset() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('React tip confirmation', () => {
  it.each(['mainnet', 'testnet'])('confirms a resolved %s tip before notifying once', async (network) => {
    vi.stubEnv('NEXT_PUBLIC_NIBGATE_NETWORK', network)
    const fetchMock = setupFetch()
    const out = await hook().tip()
    expect(out.status).toBe('settled')
    expect(mocks.onPaid).toHaveBeenCalledExactlyOnceWith(out)
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).paymentRail).toBe('transfer')
    expect(mocks.states[0].value).toBe('done')
  })

  it.each([false, true])('retains failed verification and retries only the proof (held=%s)', async (held) => {
    let failed = true
    const fetchMock = setupFetch({ verify: () => failed ? ok({ success: false }, 402) : ok({ success: true, holdStatus: 'held', tip: heldReceipt(), receipt: confirmedReceipt() }) })
    const client = hook({ recipient: held ? undefined : recipient })
    await expect(client.tip()).rejects.toMatchObject({ txHash })
    expect(mocks.states[0].value).toBe('pending')
    expect(mocks.states[2].value).toMatchObject({ txHash, status: 'pending', held: false })
    expect(mocks.onPaid).not.toHaveBeenCalled()
    failed = false
    const out = await client.retryVerification()
    expect(out).toMatchObject({ held, status: held ? 'held' : 'settled' })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.onPaid).toHaveBeenCalledExactlyOnceWith(out)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await expect(client.retryVerification()).rejects.toThrow(/No submitted tip/)
  })

  it('does not bypass a failed challenge with a direct creator payment', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ error: 'unavailable' }, 500)))
    await expect(hook().tip()).rejects.toThrow(/No transaction was sent/)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.onPaid).not.toHaveBeenCalled()
  })

  it('does not pay when the hub advertises the other network', async () => {
    vi.stubEnv('NEXT_PUBLIC_NIBGATE_NETWORK', 'testnet')
    vi.stubGlobal('fetch', vi.fn(async () => ok({ success: true, payee: box, accepts: [{ network: 'eip155:5042' }] })))
    await expect(hook().tip()).rejects.toThrow(/network do not match/)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('blocks a duplicate click while verification is in progress', async () => {
    let finish
    setupFetch({ verify: () => new Promise(resolve => { finish = resolve }) })
    const client = hook()
    const payment = client.tip()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await expect(client.tip()).rejects.toThrow(/already in progress/)
    finish(ok({ success: true, receipt: confirmedReceipt() }))
    await payment
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.onPaid).toHaveBeenCalledOnce()
  })

  it('retains a standalone transaction when chain confirmation fails, then retries the receipt', async () => {
    mocks.wait.mockRejectedValueOnce(new Error('RPC unavailable')).mockResolvedValueOnce({ status: 'success', transactionHash: txHash })
    const client = hook({ apiBase: undefined })
    await expect(client.tip()).rejects.toMatchObject({ txHash })
    expect(mocks.onPaid).not.toHaveBeenCalled()
    expect((await client.retryVerification()).status).toBe('settled')
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.wait).toHaveBeenCalledTimes(2)
    expect(mocks.wait).toHaveBeenCalledWith({ hash: txHash, checkReplacement: false })
    expect(mocks.onPaid).toHaveBeenCalledOnce()
  })

  it.each([
    null, {}, { status: 'success' }, { status: 'reverted', transactionHash: txHash },
    { status: 'success', transactionHash: `0x${'cd'.repeat(32)}` },
  ])('does not confirm a standalone replacement or incomplete receipt (%j)', async (mined) => {
    mocks.wait.mockResolvedValueOnce(mined)
    const client = hook({ apiBase: undefined })
    await expect(client.tip()).rejects.toMatchObject({ txHash })
    expect(mocks.states[0].value).toBe('pending')
    expect(mocks.onPaid).not.toHaveBeenCalled()
    await expect(client.retryVerification()).resolves.toMatchObject({ status: 'settled', txHash })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.wait).toHaveBeenCalledTimes(2)
    expect(mocks.onPaid).toHaveBeenCalledOnce()
  })

  it.each([false, true])('retains malformed confirmation responses and retries only the original proof (held=%s)', async (held) => {
    const malformed = [
      null, [], 'confirmed', {}, { success: false }, { success: true },
      ...[null, [], '', {}, { paymentId: txHash }].map(receipt => ({ success: true, holdStatus: 'held', receipt, tip: receipt })),
      ...[
        { paymentId: '' }, { paymentId: null }, { amount: 0 }, { amount: true }, { amount: 1 }, { currency: 'ETH' },
        { txHash: '' }, { txHash: `0x${'cd'.repeat(32)}` },
        ...(held ? [{ id: '' }, { status: 'settled' }, { status: 'claimed' }, { status: 'refunded' }] : [{ type: 'payment' }, { status: 'pending' }]),
      ].map(overrides => ({ success: true, holdStatus: 'held', receipt: confirmedReceipt(overrides), tip: heldReceipt(overrides) })),
    ]
    let next = 0
    const fetchMock = setupFetch({ verify: () => next < malformed.length
      ? ok(malformed[next++])
      : ok({ success: true, holdStatus: 'held', receipt: confirmedReceipt(), tip: heldReceipt() }) })
    const client = hook({ recipient: held ? undefined : recipient })
    for (let i = 0; i < malformed.length; i++) {
      await expect(client.tip('0.25')).rejects.toMatchObject({ txHash })
      expect(mocks.states[0].value).toBe('pending')
      expect(mocks.onPaid).not.toHaveBeenCalled()
      expect(mocks.send).toHaveBeenCalledOnce()
    }
    await expect(client.tip('5')).resolves.toMatchObject({ status: held ? 'held' : 'settled', amount: .25 })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.onPaid).toHaveBeenCalledOnce()
    const proofs = fetchMock.mock.calls.slice(1).map(([, init]) => JSON.parse(init.body))
    expect(proofs.every(proof => JSON.stringify(proof) === JSON.stringify(proofs[0]))).toBe(true)
  })

  it.each([false, true])('accepts authoritative Gateway identity without an on-chain hash (held=%s)', async (held) => {
    const fields = { paymentId: `gateway:${activeChain().caip2}:${mocks.account}:nonce`, txHash: null, amount: '0.25' }
    setupFetch({ verify: () => ok({ success: true, holdStatus: 'held', receipt: confirmedReceipt(fields), tip: heldReceipt(fields) }) })
    const out = await hook({ recipient: held ? undefined : recipient }).tip()
    expect(out.status).toBe(held ? 'held' : 'settled')
    expect(mocks.onPaid).toHaveBeenCalledExactlyOnceWith(out)
    expect(held ? out.receipt.txHash : out.txHash).toBeNull()
  })

  it.each([{}, { success: false }, { success: true, holdStatus: 'challenge' }])('does not report a held tip without authoritative confirmation (%j)', async (body) => {
    setupFetch({ verify: () => ok(body) })
    await expect(hook({ recipient: undefined }).tip()).rejects.toMatchObject({ txHash })
    expect(mocks.onPaid).not.toHaveBeenCalled()
    expect(mocks.states[0].value).toBe('pending')
  })

  it('preserves submitted proof after a lost verification response', async () => {
    let failed = true
    setupFetch({ verify: () => { if (failed) throw new Error('Network lost'); return ok({ success: true, replayed: true, receipt: confirmedReceipt() }) } })
    const client = hook()
    await expect(client.tip()).rejects.toMatchObject({ txHash })
    failed = false
    await client.tip('1') // Even a different amount cannot overwrite the unresolved payment.
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.onPaid).toHaveBeenCalledOnce()
    expect(mocks.states[2].value.amount).toBe(.25)
  })

  it('does not repeat a notification when the host callback throws', async () => {
    setupFetch()
    mocks.onPaid.mockImplementation(() => { throw new Error('Host callback failed') })
    const client = hook()
    await expect(client.tip()).resolves.toMatchObject({ status: 'settled' })
    expect(mocks.states[0].value).toBe('done')
    expect(mocks.states[1].value).toMatch(/tip is confirmed/)
    await expect(client.retryVerification()).rejects.toThrow(/No submitted tip/)
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.onPaid).toHaveBeenCalledOnce()
    expect(mocks.states[2].value.status).toBe('settled')
  })

  it('normalizes an explicit Gateway quote to USDC before a direct wallet transfer', async () => {
    const out = await hook({ apiBase: undefined, challenge: { paymentRail: 'gateway', accepts: [{ payTo: recipient, amount: '250000', network: activeChain().caip2 }] } }).tip()
    expect(out.amount).toBe(.25)
    const transfer = mocks.send.mock.calls[0][0]
    expect(BigInt(`0x${transfer.data.slice(-64)}`)).toBe(250000n)
  })

  it.each([false, true])('blocks already-recorded proof conflicts without repayment or repeated verification (held=%s)', async (held) => {
    const fetchMock = setupFetch({ verify: () => ok({ success: false, code: 'payment-proof-already-used', existingStatus: 'refunded' }, 409) })
    const client = hook({ recipient: held ? undefined : recipient })
    await expect(client.tip()).rejects.toMatchObject({ txHash })
    expect(mocks.states[0].value).toBe('blocked')
    expect(mocks.states[1].value).toMatch(/already recorded/)
    expect(mocks.states[2].value.status).toBe('conflict')
    await expect(client.retryVerification()).rejects.toThrow(/already recorded/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.onPaid).not.toHaveBeenCalled()
  })


  it.each([false, true])('retains a pending backend reservation without submitting another payment (held=%s)', async (held) => {
    let pending = true
    const fetchMock = setupFetch({ verify: () => pending
      ? ok({ success: false, code: 'payment-verification-pending' }, 409)
      : ok({ success: true, replayed: true, holdStatus: 'held', tip: heldReceipt(), receipt: confirmedReceipt() }) })
    const client = hook({ recipient: held ? undefined : recipient })
    await expect(client.tip()).rejects.toMatchObject({ txHash })
    expect(mocks.states[0].value).toBe('pending')
    expect(mocks.states[1].value).toMatch(/still being reconciled/)
    expect(mocks.onPaid).not.toHaveBeenCalled()
    await expect(client.tip('5')).rejects.toMatchObject({ txHash })
    expect(mocks.send).toHaveBeenCalledOnce()
    pending = false
    await expect(client.retryVerification()).resolves.toMatchObject({ held, status: held ? 'held' : 'settled' })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.onPaid).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
