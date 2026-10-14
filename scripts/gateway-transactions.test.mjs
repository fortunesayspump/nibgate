// Offline regression coverage. No real wallets, network calls, or transactions.
// Run: node --test scripts/gateway-transactions.test.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  parseGatewayAmount, runGatewayTransfer, gatewayTransferKey,
  createGatewayTransferStore, clearGatewayTransfer,
} from '../packages/wallet/src/gateway-transactions.js'

const address = `0x${'1'.repeat(40)}`
const other = `0x${'2'.repeat(40)}`
const gateway = `0x${'7'.repeat(40)}`
const usdc = `0x${'3'.repeat(40)}`
const approval = `0x${'a'.repeat(64)}`
const deposit = `0x${'b'.repeat(64)}`
const receipt = (hash, status = 'success') => ({ transactionHash: hash, status })
function fixture(overrides = {}) {
  const events = []
  const records = new Map()
  const provider = new EventEmitter()
  const options = {
    provider, address, gateway, usdc, chainId: 5042002, kind: 'deposit', amount: '1.25',
    assertActive: () => {},
    store: {
      read: (key) => records.get(key) || null,
      write: (key, value) => records.set(key, structuredClone(value)),
      clear: (key) => records.delete(key),
    },
    ensureNetwork: async (p) => { assert.equal(p, provider); events.push('switch') },
    checkConnection: async (p) => { assert.equal(p, provider); events.push('health') },
    waitForReceipt: async (hash) => { events.push(`receipt:${hash}`); return receipt(hash) },
    getTransaction: async (hash) => {
      const saved = options.store.read(gatewayTransferKey(options))
      const isApproval = hash === saved?.approvalHash
      const target = isApproval ? options.usdc : options.gateway
      const token = isApproval ? options.gateway : options.usdc
      const selector = isApproval ? '0x095ea7b3' : saved.kind === 'deposit' ? '0x47e7ef24' : '0xf3fef3a3'
      return { hash, from: options.address, to: target, chainId: options.chainId, value: 0n, input: `${selector}${token.slice(2).padStart(64, '0')}${parseGatewayAmount(saved.amount).toString(16).padStart(64, '0')}` }
    },
    onUpdate: (value, message) => { events.push({ value, message }) },
    ...overrides,
  }
  provider.request = async ({ method, params }) => {
    events.push({ method, params })
    if (method === 'eth_accounts') return [address]
    if (method === 'eth_chainId') return `0x${options.chainId.toString(16)}`
    if (method === 'eth_sendTransaction') return params[0].data.startsWith('0x095ea7b3') ? approval : deposit
    throw Error(`Unexpected request: ${method}`)
  }
  return {
    options, provider, records, events,
    run: (extra = {}) => runGatewayTransfer({ ...options, ...extra }),
    sends: () => events.filter((entry) => entry?.method === 'eth_sendTransaction'),
    saved: () => records.get(gatewayTransferKey(options)),
  }
}

for (const chainId of [5042002, 5042]) {
  test(`selected provider only, explicit chain ${chainId}, receipt-gated success`, async () => {
    globalThis.window = { ethereum: { request: () => { throw Error('Wrong injected provider used') } } }
    const f = fixture({ chainId })
    const result = await f.run()
    assert.equal(result.status, 'confirmed')
    assert.equal(f.sends().length, 2)
    assert.ok(f.sends().every(({ params }) => params[0].from === address && params[0].chainId === `0x${chainId.toString(16)}`))
    assert.ok(f.events.indexOf(`receipt:${approval}`) < f.events.indexOf(f.sends()[1]))
    assert.ok(f.events.indexOf(`receipt:${deposit}`) < f.events.findIndex((e) => e?.message === 'Deposited!'))
    assert.equal(f.provider.listenerCount('accountsChanged'), 0)
    delete globalThis.window
  })
}

test('missing AppKit provider never falls back to window.ethereum', async () => {
  const f = fixture()
  await assert.rejects(f.run({ provider: null }), /Connect an EVM wallet/)
  assert.equal(f.sends().length, 0)
})

test('a displayed/authorized account mismatch stops before switch or send', async () => {
  const f = fixture()
  f.provider.request = async () => [other]
  await assert.rejects(f.run(), /does not match/)
  assert.equal(f.events.includes('switch'), false)
  assert.equal(f.sends().length, 0)
})

for (const code of [4001, 4100, -32603]) {
  test(`switch failure ${code} never sends`, async () => {
    const f = fixture({ ensureNetwork: async () => { throw Object.assign(Error('switch failed'), { code }) } })
    await assert.rejects(f.run(), /switch failed/)
    assert.equal(f.sends().length, 0)
  })
}

test('a switch that resolves without changing chain never sends', async () => {
  const f = fixture()
  const request = f.provider.request
  f.provider.request = (args) => args.method === 'eth_chainId' ? Promise.resolve('0x1') : request(args)
  await assert.rejects(f.run(), /wrong network/)
  assert.equal(f.sends().length, 0)
})

test('approval reverting prevents deposit and never reports success', async () => {
  const f = fixture({ waitForReceipt: async (hash) => receipt(hash, 'reverted') })
  await assert.rejects(f.run(), /Approval reverted/)
  assert.equal(f.sends().length, 1)
  assert.equal(f.saved().status, 'reverted')
  assert.equal(f.events.some((e) => e?.message === 'Deposited!'), false)
})

test('deposit reverting is not a successful deposit', async () => {
  const f = fixture({ waitForReceipt: async (hash) => receipt(hash, hash === approval ? 'success' : 'reverted') })
  await assert.rejects(f.run(), /Gateway transaction reverted/)
  assert.equal(f.sends().length, 2)
  assert.equal(f.saved().status, 'reverted')
})

test('a pending approval receipt never permits the deposit', async () => {
  const f = fixture({ waitForReceipt: async (hash) => receipt(hash, undefined) })
  // Explicit pending status; default parameter would otherwise mean success.
  f.options.waitForReceipt = async (hash) => ({ transactionHash: hash })
  await assert.rejects(f.run(), /still pending/)
  assert.equal(f.sends().length, 1)
})

test('a replacement/cancel receipt is not treated as approval', async () => {
  const f = fixture({ waitForReceipt: async () => receipt(deposit) })
  await assert.rejects(f.run(), /does not match/)
  assert.equal(f.sends().length, 1)
})

test('approval timeout recovery verifies the original approval before one deposit', async () => {
  const f = fixture()
  await assert.rejects(f.run({ waitForReceipt: async () => { throw Error('timeout') } }), /timeout/)
  assert.equal(f.saved().approvalHash, approval)
  assert.equal(f.sends().length, 1)
  const result = await f.run({ amount: '99' })
  assert.equal(result.amount, '1.25')
  assert.equal(f.sends().length, 2)
  assert.equal(BigInt(`0x${f.sends()[1].params[0].data.slice(-64)}`), 1250000n)
})

test('deposit timeout recovery checks only its saved hash, without wallet requests', async () => {
  const f = fixture({ waitForReceipt: async (hash) => { if (hash === deposit) throw Error('timeout'); return receipt(hash) } })
  await assert.rejects(f.run(), /timeout/)
  assert.equal(f.saved().transferHash, deposit)
  const checked = []
  f.provider.request = () => { throw Error('Recovery must not send or switch') }
  const result = await f.run({ waitForReceipt: async (hash) => { checked.push(hash); return receipt(hash) } })
  assert.equal(result.status, 'confirmed')
  assert.deepEqual(checked, [deposit])
  assert.equal(f.sends().length, 2)
})

for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) {
  test(`${event} during approval confirmation stops the subsequent deposit`, async () => {
    const f = fixture()
    await assert.rejects(f.run({ waitForReceipt: async (hash) => {
      f.provider.emit(event, event === 'accountsChanged' ? [other] : '0x1')
      // Switching back must not revive this already-invalidated attempt.
      if (event === 'accountsChanged') f.provider.emit(event, [address])
      if (event === 'chainChanged') f.provider.emit(event, '0x4cef52')
      return receipt(hash)
    } }), /changed/)
    assert.equal(f.sends().length, 1)
    assert.equal(f.saved().approvalHash, approval)
  })
}

test('AppKit provider replacement or modal close during approval stops deposit', async () => {
  let active = true
  const f = fixture({ assertActive: () => { if (!active) throw Error('selection changed') } })
  await assert.rejects(f.run({ waitForReceipt: async (hash) => { active = false; return receipt(hash) } }), /selection changed/)
  assert.equal(f.sends().length, 1)
  active = true
  await f.run()
  assert.equal(f.sends().length, 2)
})

test('account authorization is rechecked immediately before the deposit', async () => {
  const f = fixture()
  const request = f.provider.request
  let changed = false
  f.provider.request = (args) => args.method === 'eth_accounts' && changed ? Promise.resolve([other]) : request(args)
  await assert.rejects(f.run({ waitForReceipt: async (hash) => { changed = true; return receipt(hash) } }), /does not match/)
  assert.equal(f.sends().length, 1)
})

test('chain is rechecked before deposit even if no provider event fires', async () => {
  const f = fixture()
  const request = f.provider.request
  let changed = false
  f.provider.request = (args) => args.method === 'eth_chainId' && changed ? Promise.resolve('0x1') : request(args)
  await assert.rejects(f.run({ waitForReceipt: async (hash) => { changed = true; return receipt(hash) } }), /wrong network/)
  assert.equal(f.sends().length, 1)
})

test('concurrent/repeated clicks cannot create another payment', async () => {
  let release
  let reached
  const waiting = new Promise((resolve) => { reached = resolve })
  const f = fixture()
  const first = f.run({ waitForReceipt: async (hash) => {
    if (hash === approval) { reached(); await new Promise((resolve) => { release = resolve }) }
    return receipt(hash)
  } })
  await waiting
  await assert.rejects(f.run(), /already in progress/)
  release()
  await first
  await f.run()
  assert.equal(f.sends().length, 2)
})

test('withdrawal uses the same account/chain guard and waits for confirmation', async () => {
  const f = fixture({ kind: 'withdraw' })
  const result = await f.run()
  assert.equal(result.status, 'confirmed')
  assert.equal(f.sends().length, 1)
  assert.ok(f.sends()[0].params[0].data.startsWith('0xf3fef3a3'))
  assert.ok(f.events.indexOf(`receipt:${deposit}`) < f.events.findIndex((e) => e?.message === 'Withdrawn!'))
})

test('uncertain wallet send without a hash blocks replay', async () => {
  const f = fixture()
  const request = f.provider.request
  let sends = 0
  f.provider.request = (args) => {
    if (args.method === 'eth_sendTransaction') { sends++; throw Error('lost response') }
    return request(args)
  }
  await assert.rejects(f.run(), /lost response/)
  await assert.rejects(f.run(), /interrupted before its hash/)
  assert.equal(sends, 1)
  assert.throws(() => clearGatewayTransfer({ store: f.options.store, key: gatewayTransferKey(f.options) }), /pending/)
})

test('explicit wallet rejection can be retried without a false unknown-send lock', async () => {
  const f = fixture()
  const request = f.provider.request
  f.provider.request = (args) => {
    if (args.method === 'eth_sendTransaction') throw Object.assign(Error('rejected'), { code: 4001 })
    return request(args)
  }
  await assert.rejects(f.run(), /rejected/)
  assert.equal(f.saved().submitting, null)
  f.provider.request = request
  assert.equal((await f.run()).status, 'confirmed')
})

test('an unresolved deposit cannot be reset or replaced with a withdrawal', async () => {
  const f = fixture({ waitForReceipt: async () => { throw Error('timeout') } })
  await assert.rejects(f.run(), /timeout/)
  await assert.rejects(f.run({ kind: 'withdraw' }), /Resume the saved deposit/)
  assert.throws(() => clearGatewayTransfer({ store: f.options.store, key: gatewayTransferKey(f.options) }), /pending/)
  assert.equal(f.sends().length, 1)
})

test('a confirmed transfer needs an explicit reset before a new transfer', async () => {
  const f = fixture()
  await f.run()
  await f.run({ amount: '2' })
  assert.equal(f.sends().length, 2)
  clearGatewayTransfer({ store: f.options.store, key: gatewayTransferKey(f.options) })
  await f.run({ amount: '2' })
  assert.equal(f.sends().length, 4)
})

test('session recovery survives a fresh module instance without another send', async () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const f = fixture({ address: `0x${'4'.repeat(40)}`, store: createGatewayTransferStore(() => storage) })
  const request = f.provider.request
  f.provider.request = (args) => args.method === 'eth_accounts' ? Promise.resolve([f.options.address]) : request(args)
  await assert.rejects(f.run({ waitForReceipt: async (hash) => { if (hash === deposit) throw Error('timeout'); return receipt(hash) } }), /timeout/)
  const fresh = await import(`../packages/wallet/src/gateway-transactions.js?reload=${Date.now()}`)
  const restored = fresh.createGatewayTransferStore(() => storage)
  f.provider.request = () => { throw Error('No wallet request allowed during receipt recovery') }
  const result = await fresh.runGatewayTransfer({ ...f.options, store: restored })
  assert.equal(result.status, 'confirmed')
  assert.equal(result.transferHash, deposit)
  assert.equal(f.sends().length, 2)
})

test('failed recovery storage prevents a new send', async () => {
  const f = fixture({ store: { read: () => null, write: () => { throw Error('storage blocked') } } })
  await assert.rejects(f.run(), /storage blocked/)
  assert.equal(f.sends().length, 0)
})

test('amount parsing rejects truncation, exponent notation, negatives and uint overflow', () => {
  assert.equal(parseGatewayAmount('.000001'), 1n)
  assert.equal(parseGatewayAmount('12.340000'), 12340000n)
  for (const value of ['0', '-1', '1e3', '0.0000001', '1.2345678', 'NaN', 'Infinity', '', '9'.repeat(80)]) {
    assert.throws(() => parseGatewayAmount(value))
  }
})

test('both UIs use the shared AppKit hook and never window.ethereum', async () => {
  const files = ['../frontend/src/components/WalletButton.tsx', '../packages/wallet/src/react/gateway-wallet.jsx']
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    assert.match(source, /useGatewayTransfer\(address\)/)
    assert.doesNotMatch(source, /window\.ethereum/)
    assert.match(source, /transfer\?\.approvalHash/)
    assert.match(source, /transfer\?\.transferHash/)
  }
  const hook = await readFile(new URL('../packages/wallet/src/react/useGatewayTransfer.js', import.meta.url), 'utf8')
  assert.match(hook, /useAppKitProvider\('eip155'\)/)
  assert.match(hook, /checkReplacement: false/)
  assert.doesNotMatch(hook, /window\.ethereum/)
})

for (const code of [4900, 4901]) {
  test(`ambiguous disconnected send ${code} retains the no-replay marker`, async () => {
    const f = fixture()
    const request = f.provider.request
    let sendCount = 0
    f.provider.request = (args) => {
      if (args.method === 'eth_sendTransaction') { sendCount++; throw Object.assign(Error('connection lost'), { code }) }
      return request(args)
    }
    await assert.rejects(f.run(), /connection lost/)
    await assert.rejects(f.run(), /interrupted before its hash/)
    assert.equal(sendCount, 1)
  })
}

test('falsey, scalar and array recovery JSON fails closed', () => {
  for (const [i, raw] of ['null', 'false', '0', '""', '[]', '"text"'].entries()) {
    const store = createGatewayTransferStore(() => ({ getItem: () => raw }))
    assert.throws(() => store.read(`malformed-recovery-${i}`), /unreadable/)
  }
})

test('confirmed recovery state without a transfer hash never reports success', async () => {
  const f = fixture()
  f.options.store.write(gatewayTransferKey(f.options), { ...f.options, provider: undefined, store: undefined, assertActive: undefined, ensureNetwork: undefined, waitForReceipt: undefined, getTransaction: undefined, checkConnection: undefined, onUpdate: undefined, status: 'confirmed', submitting: null, approvalHash: null, transferHash: null })
  await assert.rejects(f.run(), /does not match/)
  assert.equal(f.sends().length, 0)
  assert.equal(f.events.some((e) => e?.message === 'Deposited!'), false)
})

for (const field of ['from', 'to', 'input', 'chainId', 'value']) {
  test(`a successful unrelated transaction with mismatched ${field} cannot confirm a transfer`, async () => {
    const f = fixture()
    const getTransaction = f.options.getTransaction
    await assert.rejects(f.run({ getTransaction: async (hash) => ({ ...await getTransaction(hash), [field]: field === 'chainId' ? 1 : field === 'value' ? 1n : other }) }), /does not match/)
    assert.equal(f.sends().length, 1)
    assert.equal(f.saved().status, 'pending')
  })
}

test('terminal recovery after module reload rechecks its receipt before reset', async () => {
  const f = fixture()
  await f.run()
  const fresh = await import(`../packages/wallet/src/gateway-transactions.js?terminal=${Date.now()}`)
  assert.throws(() => fresh.clearGatewayTransfer({ store: f.options.store, key: gatewayTransferKey(f.options) }), /receipt/)
  const checks = []
  await fresh.runGatewayTransfer({ ...f.options, waitForReceipt: async (hash) => { checks.push(hash); return receipt(hash) } })
  assert.deepEqual(checks, [deposit])
  fresh.clearGatewayTransfer({ store: f.options.store, key: gatewayTransferKey(f.options) })
  assert.equal(f.saved(), undefined)
  assert.equal(f.sends().length, 2)
})

test('rejected approval with no submitted hash can be cancelled to edit amount', async () => {
  const f = fixture()
  const request = f.provider.request
  f.provider.request = (args) => args.method === 'eth_sendTransaction' ? Promise.reject(Object.assign(Error('rejected'), { code: 4001 })) : request(args)
  await assert.rejects(f.run(), /rejected/)
  clearGatewayTransfer({ store: f.options.store, key: gatewayTransferKey(f.options) })
  assert.equal(f.saved(), undefined)
  f.provider.request = request
  assert.equal((await f.run({ amount: '2' })).amount, '2')
})

test('withdrawal recovery checks its saved hash without another withdrawal', async () => {
  const f = fixture({ kind: 'withdraw' })
  await assert.rejects(f.run({ waitForReceipt: async () => { throw Error('timeout') } }), /timeout/)
  assert.equal(f.sends().length, 1)
  assert.equal((await f.run({ amount: '10' })).amount, '1.25')
  assert.equal(f.sends().length, 1)
})

test('withdrawal cannot proceed after a rejected chain switch', async () => {
  const f = fixture({ kind: 'withdraw', ensureNetwork: async () => { throw Object.assign(Error('switch rejected'), { code: 4001 }) } })
  await assert.rejects(f.run(), /switch rejected/)
  assert.equal(f.sends().length, 0)
})

test('an unhealthy selected-provider RPC blocks approval before any send', async () => {
  const f = fixture({ checkConnection: async () => { throw Error('RPC unhealthy') } })
  await assert.rejects(f.run(), /RPC unhealthy/)
  assert.equal(f.sends().length, 0)
})

test('RPC failure after approval preserves its hash and blocks deposit', async () => {
  let checks = 0
  const f = fixture({ checkConnection: async () => { if (++checks === 2) throw Error('RPC unhealthy') } })
  await assert.rejects(f.run(), /RPC unhealthy/)
  assert.equal(f.sends().length, 1)
  assert.equal(f.saved().approvalHash, approval)
  assert.equal(f.saved().transferHash, null)
  assert.equal(f.saved().submitting, null)
  assert.equal((await f.run()).status, 'confirmed')
  assert.equal(f.sends().length, 2)
})

test('an account change during health-check latency is caught before send', async () => {
  const f = fixture()
  const request = f.provider.request
  await assert.rejects(f.run({ checkConnection: async () => {
    f.provider.request = (args) => args.method === 'eth_accounts' ? Promise.resolve([other]) : request(args)
  } }), /does not match/)
  assert.equal(f.sends().length, 0)
})

test('withdrawal health failure prevents any transaction request', async () => {
  const f = fixture({ kind: 'withdraw', checkConnection: async () => { throw Error('RPC unhealthy') } })
  await assert.rejects(f.run(), /RPC unhealthy/)
  assert.equal(f.sends().length, 0)
})
