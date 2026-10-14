// Controlled hook harness for offline tests when workspace dependencies are
// unavailable. Executes the real hook body with React/AppKit/viem boundaries
// stubbed. This is not a browser or React renderer integration test.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from './test-source.mjs'
import test from 'node:test'
import * as engine from '../packages/wallet/src/gateway-transactions.js'

const source = (await readFile(new URL('../packages/wallet/src/react/useGatewayTransfer.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '')
  .replace('export function useGatewayTransfer', 'function useGatewayTransfer')
const address = `0x${'1'.repeat(40)}`
const other = `0x${'2'.repeat(40)}`
const approval = `0x${'a'.repeat(64)}`
const deposit = `0x${'b'.repeat(64)}`
function harness(overrides = {}) {
  const state = [], refs = [], effectDeps = [], cleanups = [], effectFns = []
  let stateIndex = 0, refIndex = 0, effectIndex = 0
  let effects = []
  let connected = { address, isConnected: true }
  let selected
  let sends = 0
  let holdApproval, releaseApproval
  const sent = new Map()
  const provider = new EventEmitter()
  provider.request = async ({ method, params }) => {
    if (method === 'eth_accounts') return [address]
    if (method === 'eth_chainId') return '0x4cef52'
    if (method === 'eth_sendTransaction') {
      const hash = ++sends === 1 ? approval : deposit
      sent.set(hash, { ...params[0], hash, input: params[0].data, value: 0n })
      return hash
    }
    throw Error(`unexpected ${method}`)
  }
  selected = provider
  const records = new Map()
  const dependencies = {
    useState: (initial) => { const i = stateIndex++; if (!(i in state)) state[i] = initial; return [state[i], (value) => { state[i] = value }] },
    useRef: (initial) => { const i = refIndex++; return refs[i] ||= { current: initial } },
    useEffect: (callback, deps) => {
      const i = effectIndex++
      if (!effectDeps[i] || deps.some((value, n) => value !== effectDeps[i][n])) {
        effectDeps[i] = deps
        effectFns[i] = callback
        effects.push(() => { cleanups[i]?.(); cleanups[i] = callback() })
      }
    },
    useAppKitAccount: () => connected,
    useAppKitProvider: (namespace) => { assert.equal(namespace, 'eip155'); return { walletProvider: selected } },
    createPublicClient: () => ({ getTransaction: async ({ hash }) => sent.get(hash), waitForTransactionReceipt: async ({ hash, checkReplacement }) => {
      assert.equal(checkReplacement, false)
      if (hash === approval && holdApproval) { holdApproval(); await new Promise((resolve) => { releaseApproval = resolve }) }
      return { transactionHash: hash, status: 'success' }
    } }),
    http: (url) => url,
    activeArcChain: () => ({ id: 5042002 }),
    activeChain: () => ({ id: 5042002, name: 'Arc Testnet' }),
    appRpcUrlFor: () => 'https://read-only.invalid/rpc',
    ensureArcNetwork: async (p) => { assert.equal(p, provider) },
    checkArcConnection: async (p) => { assert.equal(p, provider) },
    repairArcNetwork: async (p) => { assert.equal(p, provider) },
    getWalletErrorMessage: (error) => `Wallet error (${error.code || 'unknown'}).`,
    ...engine,
    createGatewayTransferStore: () => ({ read: (key) => records.get(key) || null, write: (key, value) => records.set(key, structuredClone(value)), clear: (key) => records.delete(key) }),
    ...overrides,
  }
  const factory = new Function(...Object.keys(dependencies), `${source}\nreturn useGatewayTransfer`)
  const useGatewayTransfer = factory(...Object.values(dependencies))
  const render = (displayed = address) => {
    stateIndex = 0; refIndex = 0; effectIndex = 0; effects = []
    const result = useGatewayTransfer(displayed)
    effects.forEach((effect) => effect())
    return result
  }
  return {
    render, provider, sends: () => sends, journal: () => structuredClone([...records]),
    select: (value) => { selected = value },
    account: (value) => { connected = value },
    unmount: () => cleanups.forEach((fn) => fn?.()),
    replayEffects: () => { cleanups.forEach((fn) => fn?.()); effectFns.forEach((fn, i) => { cleanups[i] = fn() }) },
    pause: () => new Promise((resolve) => { holdApproval = resolve }),
    release: () => { holdApproval = null; releaseApproval() },
  }
}

test('AppKit provider is used even when injected global would fail with 4100', async () => {
  const h = harness()
  globalThis.window = { ethereum: { request: () => { throw Object.assign(Error('unauthorized'), { code: 4100 }) } } }
  const result = await h.render().run('deposit', '1')
  assert.equal(result.status, 'confirmed')
  assert.equal(h.sends(), 2)
  delete globalThis.window
})

test('missing AppKit provider cannot use the injected wallet', async () => {
  const h = harness()
  h.select(undefined)
  assert.equal(await h.render().run('deposit', '1'), null)
  assert.equal(h.sends(), 0)
  assert.match(h.render().status, /Connect an EVM wallet/)
})

test('AppKit account and displayed address must match', async () => {
  const h = harness()
  h.account({ address: other, isConnected: true })
  assert.equal(await h.render().run('deposit', '1'), null)
  assert.equal(h.sends(), 0)
})

for (const action of ['provider', 'account', 'disconnect', 'close']) {
  test(`${action} change during approval cannot continue the deposit`, async () => {
    const h = harness()
    const paused = h.pause()
    const operation = h.render().run('deposit', '1')
    await paused
    if (action === 'provider') h.select({ request: () => { throw Error('New provider must not be used') } })
    if (action === 'account') h.account({ address: other, isConnected: true })
    if (action === 'disconnect') h.account({ address, isConnected: false })
    if (action === 'close') h.unmount()
    else h.render()
    h.release()
    assert.equal(await operation, null)
    assert.equal(h.sends(), 1)
  })
}

test('re-render with the same selection does not interrupt confirmation', async () => {
  const h = harness()
  const paused = h.pause()
  const operation = h.render().run('deposit', '1')
  await paused
  assert.equal(h.render().busy, true)
  h.release()
  assert.equal((await operation).status, 'confirmed')
  assert.equal(h.sends(), 2)
})

test('duplicate clicks in the same render are locked synchronously', async () => {
  const h = harness()
  const paused = h.pause()
  const hook = h.render()
  const operation = hook.run('deposit', '1')
  assert.equal(await hook.run('deposit', '1'), null)
  await paused
  h.release()
  await operation
  assert.equal(h.sends(), 2)
})

test('StrictMode effect replay preserves the selected provider for the first click', async () => {
  const h = harness()
  const hook = h.render()
  h.replayEffects()
  assert.equal((await hook.run('deposit', '1')).status, 'confirmed')
  assert.equal(h.sends(), 2)
})

test('effect cleanup/replay invalidates an already-running approval attempt', async () => {
  const h = harness()
  const paused = h.pause()
  const operation = h.render().run('deposit', '1')
  await paused
  h.replayEffects()
  h.release()
  assert.equal(await operation, null)
  assert.equal(h.sends(), 1)
})

test('reset checks a terminal transfer before clearing recovery data', async () => {
  const h = harness()
  await h.render().run('deposit', '1')
  await h.render().reset()
  assert.equal(h.render().transfer, null)
  assert.equal(h.sends(), 2)
})

test('a retained callback from an older provider selection cannot send', async () => {
  const h = harness()
  const oldHook = h.render()
  h.select({ request: () => { throw Error('new provider') } })
  h.render()
  assert.equal(await oldHook.run('deposit', '1'), null)
  assert.equal(h.sends(), 0)
})

test('a retained callback from an older displayed account cannot send', async () => {
  const h = harness()
  const oldHook = h.render()
  h.account({ address: other, isConnected: true })
  h.render(other)
  assert.equal(await oldHook.run('deposit', '1'), null)
  assert.equal(h.sends(), 0)
})

test('explicit repair uses the selected provider and never submits a transfer', async () => {
  let repaired
  const h = harness({ repairArcNetwork: async (provider) => { repaired = provider } })
  const before = h.journal()
  assert.equal(await h.render().repairConnection(), true)
  assert.equal(repaired, h.provider)
  assert.equal(h.sends(), 0)
  assert.deepEqual(h.journal(), before)
  assert.match(h.render().status, /RPC is responding/)
})

test('repair preserves an approved pending deposit and requires a separate resume click', async () => {
  let checks = 0
  let fail = true
  const h = harness({ checkArcConnection: async () => { if (++checks === 2 && fail) throw Error('RPC unhealthy') } })
  assert.equal(await h.render().run('deposit', '1'), null)
  assert.equal(h.sends(), 1)
  const before = h.journal()
  fail = false
  assert.equal(await h.render().repairConnection(), true)
  assert.equal(h.sends(), 1)
  assert.deepEqual(h.journal(), before)
  assert.match(h.render().status, /saved transaction is unchanged/)
  assert.equal((await h.render().run('deposit', '9')).amount, '1')
  assert.equal(h.sends(), 2)
})

test('repair never clears an ambiguous broadcast marker or automatically retries it', async () => {
  const h = harness()
  const request = h.provider.request
  let sendAttempts = 0
  h.provider.request = (args) => {
    if (args.method === 'eth_sendTransaction' && ++sendAttempts === 2) throw Object.assign(Error('connection lost'), { code: 4900 })
    return request(args)
  }
  assert.equal(await h.render().run('deposit', '1'), null)
  const before = h.journal()
  assert.equal(h.render().transfer.submitting, 'transfer')
  assert.equal(await h.render().repairConnection(), true)
  assert.deepEqual(h.journal(), before)
  assert.equal(sendAttempts, 2)
  assert.match(h.render().status, /Check wallet activity/)
  assert.equal(await h.render().run('deposit', '1'), null)
  assert.equal(sendAttempts, 2)
})

test('cancelled network repair leaves transaction state unchanged', async () => {
  const h = harness({ repairArcNetwork: async () => { throw Object.assign(Error('user cancelled'), { code: 4001 }) } })
  const before = h.journal()
  assert.equal(await h.render().repairConnection(), false)
  assert.deepEqual(h.journal(), before)
  assert.equal(h.sends(), 0)
  assert.doesNotMatch(h.render().status, /RPC is responding/)
})

test('repair failure cannot claim a verified connection', async () => {
  const h = harness({ repairArcNetwork: async () => { throw Object.assign(Error('unhealthy after repair'), { code: 'ARC_CONNECTION_FAILED' }) } })
  assert.equal(await h.render().repairConnection(), false)
  assert.equal(h.sends(), 0)
  assert.doesNotMatch(h.render().status, /RPC is responding/)
})

test('a provider change during repair prevents a stale success message', async () => {
  let reached, finish
  const waiting = new Promise((resolve) => { reached = resolve })
  const h = harness({ repairArcNetwork: async () => { reached(); await new Promise((resolve) => { finish = resolve }) } })
  const operation = h.render().repairConnection()
  await waiting
  h.select({ request: () => { throw Error('new wallet must not be used') } })
  h.render()
  finish()
  assert.equal(await operation, false)
  assert.equal(h.sends(), 0)
  assert.doesNotMatch(h.render().status, /RPC is responding/)
})

test('repair and transaction actions share a synchronous busy lock', async () => {
  let reached, finish
  const waiting = new Promise((resolve) => { reached = resolve })
  const h = harness({ repairArcNetwork: async () => { reached(); await new Promise((resolve) => { finish = resolve }) } })
  const hook = h.render()
  const operation = hook.repairConnection()
  await waiting
  assert.equal(await hook.repairConnection(), false)
  assert.equal(await hook.run('deposit', '1'), null)
  finish()
  assert.equal(await operation, true)
  assert.equal(h.sends(), 0)
})

test('both Gateway UIs expose explicit repair without a submit side effect', async () => {
  for (const path of ['../frontend/src/components/WalletButton.tsx', '../packages/wallet/src/react/gateway-wallet.jsx']) {
    const ui = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.match(ui, /onClick=\{\(\) => (?:void repairConnection\(\)|\{ setTxMsg\(''\); void repairConnection\(\) \})\}/)
    if (path.endsWith('gateway-wallet.jsx')) assert.match(ui, /setTxMsg\(''\); void repairConnection\(\)/)
    assert.match(ui, /Repair wallet connection/)
  }
})
