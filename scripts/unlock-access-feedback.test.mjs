// Offline access/presentation boundary checks. Executes the real unlock hook
// with wallet, SDK and React boundaries controlled; never sends a payment.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (await readFile(new URL('../packages/wallet/src/react/unlock.jsx', import.meta.url), 'utf8'))
  .split('const HOLD_MS =')[0]
  .replace(/^import[^\n]+\n/gm, '')
  .replaceAll('export ', '')
  .replaceAll("await import('@nibgate/sdk')", 'sdk')
const presentationSource = (await readFile(new URL('../packages/wallet/src/react/useUnlockReveal.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]+\n/gm, '').replaceAll('export ', '')
const isVerifiedUnlock = new Function(`${presentationSource}\nreturn isVerifiedUnlock`)()
const address = '0x1111111111111111111111111111111111111111'
const resource = { id: 'article', path: '/article', price: '1' }
const verified = { ok: true, payload: { ok: true, unlockProof: 'verified-proof', content: 'Article' } }
function harness({ check = async () => verified, restored = false, pending = false, restoreResponse } = {}) {
  const states = [], refs = [], deps = [], cleanups = []
  let si = 0, ri = 0, ei = 0, effects = [], connected = true
  let provider = { request: async () => [] }
  const store = new Map()
  if (pending) store.set('nibgate:pending-payment:article', JSON.stringify({ rail: 'transfer', txHash: '0xsubmitted', at: Date.now(), amount: 1 }))
  const dependencies = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useRef(initial) { const i = ri++; return refs[i] ||= { current: initial } },
    useCallback: fn => fn,
    useEffect(fn, next) { const i = ei++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { deps[i] = next; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() }) } },
    useAppKitAccount: () => ({ address, isConnected: connected }),
    useAppKitProvider: () => ({ walletProvider: provider }),
    useDisconnect: () => ({ disconnect() {} }), useAppKit: () => ({ open: async () => {} }), useAppKitNetwork: () => ({ chainId: 5042002 }),
    activeChain: () => ({ caip2: 'eip155:5042002', rpcUrl: '/rpc' }),
    activeArcChain: () => ({ id: 5042002 }),
    ensureWalletAuthorized: async () => {}, ensureArcNetwork: async () => {}, signMessageWithProvider: async () => 'signature',
    getWalletErrorMessage: error => error.message, getPaymentErrorMessage: error => error.error || error.reason || 'not verified', isWalletRejection: () => false,
    sdk: { checkResourceAccess: check }, isVerifiedUnlock,
    fetch: async url => url.startsWith('/access') && restoreResponse ? restoreResponse : ({ ok: true, json: async () => url.startsWith('/access') ? (restored ? { ok: true, unlockProof: 'stored-proof' } : { ok: false }) : { result: '0x0' } }),
    localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    setInterval: () => 0, clearInterval() {},
  }
  const hook = new Function(...Object.keys(dependencies), `${source}\nreturn useNibgateUnlock`)(...Object.values(dependencies))
  const render = callback => {
    si = 0; ri = 0; ei = 0; effects = []
    const result = hook({ resource, accessPath: '/access', onUnlock: callback })
    effects.forEach(fn => fn())
    return result
  }
  return { render, store, provider: () => { provider = { request: async () => [] } }, connected: value => { connected = value }, unmount: () => cleanups.forEach(fn => fn?.()) }
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

for (const result of [{ ok: false, payload: { txHash: '0xsubmitted' } }, { txHash: '0xsubmitted' }, { ok: true, payload: { ok: false } }, { ok: true, payload: {} }]) {
  test(`unverified access (${JSON.stringify(result)}) never notifies success`, async () => {
    const calls = []
    const h = harness({ check: async () => result })
    const hook = h.render((...args) => calls.push(args))
    assert.equal(await hook.unlock(), false)
    assert.equal(calls.length, 0)
    assert.equal(h.render().unlocked, false)
    h.unmount()
  })
}

test('verified access alone starts the presentation callback with the full result', async () => {
  const calls = []
  const h = harness()
  assert.equal(await h.render((...args) => calls.push(args)).unlock(), true)
  assert.deepEqual(calls, [[verified]])
  assert.equal(h.render().unlocked, true)
  h.unmount()
})

test('access restoration is marked to bypass the fresh-unlock confirmation', async () => {
  const calls = []
  const h = harness({ restored: true })
  h.render((...args) => calls.push(args))
  await settle()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0].ok, true)
  assert.deepEqual(calls[0][1], { restored: true })
  h.unmount()
})

test('an in-flight result cannot be redirected into a newer presentation callback', async () => {
  let resolve
  const calls = [], newer = []
  const h = harness({ check: () => new Promise(done => { resolve = done }) })
  const operation = h.render(result => calls.push(result)).unlock()
  await settle()
  assert.equal(typeof resolve, 'function')
  h.render(result => newer.push(result))
  resolve(verified)
  await operation
  assert.deepEqual(calls, [verified])
  assert.deepEqual(newer, [])
  h.unmount()
})

test('successful interrupted-payment recovery enters the same verified transition', async () => {
  const calls = []
  const h = harness({ pending: true })
  assert.equal(await h.render(result => calls.push(result)).runRecovery(), true)
  assert.deepEqual(calls, [verified])
  assert.equal(h.store.has('nibgate:pending-payment:article'), false)
  h.unmount()
})

test('failed recovery retains its payment note and never enters success', async () => {
  const calls = []
  const h = harness({ pending: true, check: async () => ({ ok: false, payload: { reason: 'not-confirmed' } }) })
  assert.equal(await h.render(result => calls.push(result)).runRecovery(), false)
  assert.deepEqual(calls, [])
  assert.equal(h.store.has('nibgate:pending-payment:article'), true)
  h.unmount()
})

for (const [status, body] of [[500, { ok: true }], [200, { ok: 'false' }]]) {
  test(`restore requires HTTP success and an explicit true flag (${status}/${JSON.stringify(body)})`, async () => {
    const calls = []
    const h = harness({ restoreResponse: { ok: status < 400, json: async () => body } })
    h.render((...args) => calls.push(args))
    await settle()
    assert.equal(calls.length, 0)
    assert.equal(h.render().unlocked, false)
    h.unmount()
  })
}

test('provider hydration rechecks restored access for the new presentation scope', async () => {
  const first = [], next = []
  const h = harness({ restored: true })
  h.render((...args) => first.push(args))
  await settle()
  h.provider()
  h.render((...args) => next.push(args))
  await settle()
  assert.equal(first.length, 1)
  assert.equal(next.length, 1)
  assert.deepEqual(next[0][1], { restored: true })
  h.unmount()
})

test('connection-state changes recheck restored access even while the address remains', async () => {
  const calls = []
  const h = harness({ restored: true })
  h.render()
  await settle()
  h.connected(false); h.render()
  await settle()
  h.connected(true); h.render((...args) => calls.push(args))
  await settle()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0][1], { restored: true })
  h.unmount()
})

test('a disconnected flag with a lingering address cannot restore access', async () => {
  const calls = []
  const h = harness({ restored: true })
  h.connected(false)
  h.render((...args) => calls.push(args))
  await settle()
  assert.equal(calls.length, 0)
  assert.equal(h.render().unlocked, false)
  h.unmount()
})

test('the explicit existing self-unlock result remains supported', async () => {
  const self = { ok: true, self: true, payment: { self: true } }
  const calls = []
  const h = harness({ check: async () => self })
  assert.equal(await h.render(result => calls.push(result)).unlock(), true)
  assert.deepEqual(calls, [self])
  h.unmount()
})

test('misleading recovery HTTP-success wrappers cannot clear the pending note', async () => {
  const calls = []
  const h = harness({ pending: true, check: async () => ({ ok: true, payload: { ok: false } }) })
  assert.equal(await h.render(result => calls.push(result)).runRecovery(), false)
  assert.deepEqual(calls, [])
  assert.equal(h.store.has('nibgate:pending-payment:article'), true)
  h.unmount()
})
