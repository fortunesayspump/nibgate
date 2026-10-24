// Execute the actual network module with only its chain metadata dependency
// stubbed. No installed packages, HTTP, wallet, signing, or broadcasts needed.
import assert from 'node:assert/strict'
import { readFile } from './test-source.mjs'
import test from 'node:test'
const path = '../packages/wallet/src/network.js'
const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import .*?;\n/, `
const ARC_TESTNET = { id: 5042002, chainIdHex: '0x4cef52', name: 'Arc Testnet', rpcUrl: 'https://rpc.testnet.arc.io' };
const ARC_MAINNET = { id: 5042, chainIdHex: '0x13b2', name: 'Arc', rpcUrl: 'https://rpc.mainnet.arc.io' };
const activeChain = () => ARC_TESTNET;
const getAddArcNetworkParams = (chain = activeChain()) => ({ chainId: chain.chainIdHex, chainName: chain.name, rpcUrls: [chain.rpcUrl], nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 } });
`)
const network = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const { ArcConnectionError, classifyArcRpcError, checkArcConnection, ensureArcNetwork, repairArcNetwork } = network
function wallet(override = () => undefined) {
  const calls = []
  const provider = { request: async (request) => {
    calls.push(request)
    const custom = await override(request, calls)
    if (custom !== undefined) return custom
    if (request.method === 'eth_chainId') return '0x4cef52'
    if (request.method === 'eth_blockNumber') return '0x1234'
    if (request.method.startsWith('wallet_')) return null
    throw Error(`Unexpected request ${request.method}`)
  } }
  return { provider, calls }
}
test('healthy existing chain performs actual reads and never requests a network change', async () => {
  const { provider, calls } = wallet()
  const result = await ensureArcNetwork(provider, { currentChainId: 5042002 })
  assert.equal(result.switched, false)
  assert.equal(result.blockNumber, '0x1234')
  assert.ok(calls.some((c) => c.method === 'eth_blockNumber'))
  assert.ok(calls.every((c) => c.method.startsWith('eth_')))
})
test('correct cached chain cannot hide a wallet RPC 404', async () => {
  const { provider, calls } = wallet(({ method }) => { if (method === 'eth_blockNumber') throw Object.assign(Error('https://private.example/?key=secret'), { status: 404 }) })
  // This case isolates health detection from the explicit payment-time repair
  // path. The default is allowed to repair, so opt out when asserting that a
  // cached chain cannot suppress the original health error.
  await assert.rejects(ensureArcNetwork(provider, { currentChainId: 5042002, repairOnFailure: false }), (e) => e instanceof ArcConnectionError && e.reason === 'not-found' && !e.message.includes('secret'))
  assert.ok(calls.every((c) => !c.method.startsWith('wallet_')))
})
test('cached chain never overrides actual wallet chain', async () => {
  let id = '0x1'
  const { provider, calls } = wallet(({ method }) => {
    if (method === 'eth_chainId') return id
    if (method === 'wallet_switchEthereumChain') id = '0x4cef52'
  })
  assert.equal((await ensureArcNetwork(provider, { currentChainId: 5042002 })).switched, true)
  assert.equal(calls.filter((c) => c.method === 'wallet_switchEthereumChain').length, 1)
})
for (const [input, reason] of [
  [{ code: 4001 }, 'cancelled'], [{ code: '4100' }, 'unauthorized'], [{ code: -32002 }, 'pending'],
  [{ code: -32601 }, 'unsupported'], [{ code: 4200 }, 'unsupported'], [{ code: 4900 }, 'disconnected'],
  [{ status: 403 }, 'access-denied'], [{ response: { status: 429 } }, 'rate-limited'],
  [{ cause: { statusCode: 404, message: 'private payload' } }, 'not-found'],
  [{ message: 'Status: 404\nURL: https://secret.invalid' }, 'not-found'], [{ message: 'request timed out' }, 'timeout'],
]) test(`classifies ${JSON.stringify(input)} without reflecting raw details`, () => {
  const e = classifyArcRpcError(input, 'eth_blockNumber')
  assert.equal(e.reason, reason)
  assert.ok(!e.message.includes('private') && !e.message.includes('secret'))
})
test('a hung RPC read times out without changing settings or sending', async () => {
  const { provider, calls } = wallet(({ method }) => method === 'eth_blockNumber' ? new Promise(() => {}) : undefined)
  await assert.rejects(checkArcConnection(provider, { timeoutMs: 10 }), { reason: 'timeout' })
  assert.ok(calls.every((c) => c.method.startsWith('eth_')))
})
test('rejects invalid block response and mismatched second chain response', async () => {
  await assert.rejects(checkArcConnection(wallet(({ method }) => method === 'eth_blockNumber' ? null : undefined).provider), { reason: 'invalid-response' })
  let reads = 0
  await assert.rejects(checkArcConnection(wallet(({ method }) => method === 'eth_chainId' && ++reads > 1 ? '0x1' : undefined).provider), { reason: 'changed' })
})
test('repair requests official metadata and verifies reads without claiming URL installation', async () => {
  const { provider, calls } = wallet()
  const result = await repairArcNetwork(provider)
  assert.equal(result.requestedRpcUrl, 'https://rpc.testnet.arc.io')
  assert.equal(result.rpcUrl, undefined)
  assert.equal(result.blockNumber, '0x1234')
  assert.deepEqual(calls.slice(0, 2).map((c) => c.method), ['wallet_addEthereumChain', 'wallet_switchEthereumChain'])
  assert.deepEqual(calls[0].params[0].rpcUrls, ['https://rpc.testnet.arc.io'])
  assert.ok(!calls.some((c) => /sendTransaction|sign/i.test(c.method)))
})
test('successful add that retains a broken RPC produces manual instructions', async () => {
  const { provider } = wallet(({ method }) => { if (method === 'eth_blockNumber') throw { status: 404 } })
  await assert.rejects(repairArcNetwork(provider), (e) => e.manual && e.reason === 'not-found' && e.message.includes('https://rpc.testnet.arc.io'))
})
test('unsupported repair requires manual settings; cancellation does not retry', async () => {
  for (const [code, reason, manual] of [[-32601, 'unsupported', true], [4001, 'cancelled', false]]) {
    const { provider, calls } = wallet(({ method }) => { if (method === 'wallet_addEthereumChain') throw { code } })
    await assert.rejects(repairArcNetwork(provider), (e) => e.reason === reason && e.manual === manual)
    assert.equal(calls.length, 1)
  }
})
test('selection change during add prevents subsequent switch', async () => {
  let active = true
  const { provider, calls } = wallet(({ method }) => { if (method === 'wallet_addEthereumChain') active = false })
  await assert.rejects(repairArcNetwork(provider, { assertActive: () => { if (!active) throw Error('changed account') } }), { reason: 'changed' })
  assert.deepEqual(calls.map((c) => c.method), ['wallet_addEthereumChain'])
})
test('concurrent repairs cannot open duplicate prompts', async () => {
  let release
  const { provider, calls } = wallet(({ method }) => method === 'wallet_addEthereumChain' ? new Promise((resolve) => { release = () => resolve(null) }) : undefined)
  const first = repairArcNetwork(provider)
  await assert.rejects(repairArcNetwork(provider), { reason: 'pending' })
  release()
  await first
  assert.equal(calls.filter((c) => c.method === 'wallet_addEthereumChain').length, 1)
})
test('ordinary error mapping does not label an API 404 as wallet RPC failure', async () => {
  const errorSource = (await readFile(new URL('../packages/wallet/src/errors.js', import.meta.url), 'utf8')).replace(/^import .*?;\n/, '')
  const getError = new Function('ArcConnectionError', errorSource.replaceAll('export ', '') + '\nreturn getWalletErrorMessage')(ArcConnectionError)
  assert.equal(getError({ status: 404, message: 'Hub route not found' }), 'Something went wrong with your wallet. Please try again.')
  assert.match(getError(new ArcConnectionError('not-found')), /RPC returned HTTP 404/)
})
test('tip/unlock never skip health just because a cached chain matches', async () => {
  for (const file of ['tip.jsx', 'unlock.jsx']) {
    const text = await readFile(new URL(`../packages/wallet/src/react/${file}`, import.meta.url), 'utf8')
    assert.match(text, /await ensureArcNetwork\(provider\)/)
    assert.doesNotMatch(text, /if \(currentChainId === undefined \|\| !isActiveChainId\(currentChainId\)\)/)
  }
})

test('connection notice passive effect never requests repair and guards stale selections', async () => {
  let body = (await readFile(new URL('../packages/wallet/src/react/ArcConnectionNotice.jsx', import.meta.url), 'utf8'))
    .replace(/^import .*\n/gm, '').replace('export function ArcConnectionNotice', 'function ArcConnectionNotice')
  const renderGuard = body.indexOf('  if (!isConnected || !address || (!error && !message) || !visible)')
  assert.notEqual(renderGuard, -1, 'ArcConnectionNotice render guard must remain discoverable')
  body = body.slice(0, renderGuard) + '  return { error, busy, message, check };\n}'
  const state = [], refs = [], deps = [], cleanup = [], effectCallbacks = []
  let si, ri, ei, effects, checks = 0, repairs = 0
  let account = { address: '0x1111', isConnected: true }
  const provider = wallet().provider
  let selectedProvider = provider
  let finishRepair
  let delayRepair = false
  const values = {
    useState: (initial) => { const i = si++; if (!(i in state)) state[i] = initial; return [state[i], (v) => { state[i] = v }] },
    useRef: (initial) => { const i = ri++; return refs[i] ||= { current: initial } },
    useEffect: (callback, next) => { const i = ei++; if (!deps[i] || next.some((v, n) => v !== deps[i][n])) { deps[i] = next; effectCallbacks[i] = callback; effects.push(() => { cleanup[i]?.(); cleanup[i] = callback() }) } },
    useAppKitAccount: () => account, useAppKitNetwork: () => ({ chainId: 5042002 }), useAppKitProvider: () => ({ walletProvider: selectedProvider }),
    ArcConnectionError,
    checkArcConnection: async (p) => { assert.equal(p, selectedProvider); checks++; throw new ArcConnectionError('not-found') },
    repairArcNetwork: async (p, options) => { assert.equal(p, selectedProvider); options.assertActive(); repairs++; if (delayRepair) await new Promise((r) => { finishRepair = r }); options.assertActive(); return { blockNumber: '0x1' } },
  }
  const notice = new Function(...Object.keys(values), body + '\nreturn ArcConnectionNotice')(...Object.values(values))
  const render = () => { si = 0; ri = 0; ei = 0; effects = []; const result = notice(); effects.forEach((f) => f()); return result }
  render()
  await new Promise((r) => setImmediate(r))
  assert.equal(checks, 1)
  assert.equal(repairs, 0)
  assert.equal(render().error.reason, 'not-found')
  await render().check(true)
  assert.equal(repairs, 1)
  assert.match(render().message, /connection responds/)
  account = { address: '0x2222', isConnected: true }
  render()
  await new Promise((r) => setImmediate(r))
  assert.equal(checks, 2)
  assert.equal(render().message, '')
  const oldProviderCheck = render().check
  selectedProvider = wallet().provider
  render()
  await new Promise((r) => setImmediate(r))
  await oldProviderCheck(true)
  assert.equal(repairs, 1, 'retained handler must not repair its old provider')
  const oldAccountCheck = render().check
  account = { address: '0x3333', isConnected: true }
  render()
  await oldAccountCheck(true)
  assert.equal(repairs, 1, 'retained handler must not repair for its old account')
  delayRepair = true
  const pending = render().check(true)
  cleanup[0]()
  cleanup[0] = effectCallbacks[0]() // StrictMode cleanup/setup during prompt
  finishRepair()
  await pending
  assert.equal(render().message, '', 'effect replay invalidates in-flight success')
  const unmountedCheck = render().check
  cleanup.forEach((f) => f?.())
  await unmountedCheck(true)
  assert.equal(repairs, 2, 'unmounted handler must not request another repair')
})

test('actual React tip hook rejects wallet RPC 404 before any send', async () => {
  let text = await readFile(new URL('../packages/wallet/src/react/tip.jsx', import.meta.url), 'utf8')
  text = text.slice(0, text.indexOf('// Compact inline tip control'))
    .replace(/^import .*\n/gm, '').replace('export function useNibgateTip', 'function useNibgateTip')
  const icon = text.indexOf('function TipIcon('), endIcon = text.indexOf('const textBtn', icon)
  text = text.slice(0, icon) + text.slice(endIcon)
  let sends = 0
  const { provider } = wallet(({ method }) => { if (method === 'eth_blockNumber') throw { status: 404 } })
  const address = '0x1111111111111111111111111111111111111111'
  const states = []
  const values = {
    useCallback: (fn) => fn, useEffect: (fn) => fn(), useRef: (current) => ({ current }),
    useState: (initial) => { const state = { value: initial }; states.push(state); return [initial, (v) => { state.value = v }] },
    useAppKitAccount: () => ({ address, isConnected: true }), useAppKitProvider: () => ({ walletProvider: provider }), useAppKit: () => ({ open: async () => {} }),
    ArcConnectionError, classifyArcRpcError, ensureArcNetwork,
    activeArcChain: () => ({ id: 5042002 }), activeChain: () => ({ id: 5042002, caip2: 'eip155:5042002', name: 'Arc Testnet', testnet: true }),
    getWalletErrorMessage: () => null, custom: (p) => p, encodeFunctionData: () => '0x',
    createWalletClient: () => ({ sendTransaction: async () => { sends++; return `0x${'a'.repeat(64)}` } }),
    createPublicClient: () => ({ readContract: async () => 1000000n }),
  }
  const hook = new Function(...Object.keys(values), text + '\nreturn useNibgateTip')(...Object.values(values))
  const result = hook({ resource: { url: 'https://creator.example/post' }, recipient: '0x2222222222222222222222222222222222222222', amount: 0.25 })
  await assert.rejects(result.tip(), { reason: 'not-found' })
  assert.equal(sends, 0)
  assert.match(states[1].value, /RPC returned HTTP 404/)
})

for (const [id, hex, rpcUrl] of [[5042, '0x13b2', 'https://rpc.mainnet.arc.io'], [5042002, '0x4cef52', 'https://rpc.testnet.arc.io']]) {
  test(`explicit Arc ${id} health/repair uses trusted target independent of build default`, async () => {
    const { provider, calls } = wallet(({ method }) => method === 'eth_chainId' ? hex : undefined)
    const chain = { id, rpcUrl: 'https://untrusted.invalid', name: 'Fake chain' }
    assert.equal((await checkArcConnection(provider, { chain })).chainId, id)
    assert.equal((await ensureArcNetwork(provider, { chain })).switched, false)
    assert.ok(!calls.some((c) => c.method.startsWith('wallet_')), 'healthy target must not force a change')
    const result = await repairArcNetwork(provider, { chain })
    assert.equal(result.requestedRpcUrl, rpcUrl)
    const added = calls.find((c) => c.method === 'wallet_addEthereumChain')
    assert.equal(added.params[0].chainId, hex)
    assert.deepEqual(added.params[0].rpcUrls, [rpcUrl])
    assert.equal(calls.find((c) => c.method === 'wallet_switchEthereumChain').params[0].chainId, hex)
  })
  test(`Arc ${id} manual fallback names only the selected official RPC`, async () => {
    const { provider } = wallet(({ method }) => {
      if (method === 'eth_chainId') return hex
      if (method === 'eth_blockNumber') throw { status: 404 }
    })
    await assert.rejects(repairArcNetwork(provider, { chain: { id, rpcUrl: 'https://untrusted.invalid' } }), (e) => {
      assert.equal(e.manual, true)
      assert.equal(e.chainId, id)
      assert.ok(e.message.includes(rpcUrl) && !e.message.includes('untrusted'))
      return true
    })
  })
}
test('explicit mainnet switch/add fallback never uses testnet build metadata', async () => {
  let id = '0x4cef52', added = false
  const { provider, calls } = wallet(({ method }) => {
    if (method === 'eth_chainId') return id
    if (method === 'wallet_addEthereumChain') added = true
    if (method === 'wallet_switchEthereumChain') {
      if (!added) throw { code: 4902 }
      id = '0x13b2'
    }
  })
  assert.equal((await ensureArcNetwork(provider, { chain: { id: 5042 } })).chainId, 5042)
  assert.deepEqual(calls.find((c) => c.method === 'wallet_addEthereumChain').params[0].rpcUrls, ['https://rpc.mainnet.arc.io'])
})
test('non-Arc explicit targets reject before reading or changing any wallet', async () => {
  const { provider, calls } = wallet()
  for (const fn of [checkArcConnection, ensureArcNetwork, repairArcNetwork, network.switchToArcNetwork]) {
    await assert.rejects(fn(provider, { chain: { id: 1, rpcUrl: 'https://untrusted.invalid' } }), /Unsupported Arc target/)
  }
  assert.equal(calls.length, 0)
})

test('explicit-target health stops after selection changes during an RPC read', async () => {
  let active = true
  const { provider, calls } = wallet(({ method }) => { if (method === 'eth_chainId') { active = false; return '0x13b2' } })
  await assert.rejects(checkArcConnection(provider, { chain: { id: 5042 }, assertActive: () => { if (!active) throw Error('account changed') } }), { reason: 'changed', chainId: 5042 })
  assert.deepEqual(calls.map((c) => c.method), ['eth_chainId'])
})
test('ensure does not issue a switch after its first read changes selection', async () => {
  let active = true
  const { provider, calls } = wallet(() => { active = false; return '0x4cef52' })
  await assert.rejects(ensureArcNetwork(provider, { chain: { id: 5042 }, assertActive: () => { if (!active) throw Error('changed') } }), { reason: 'changed' })
  assert.equal(calls.length, 1)
})
test('missing-chain fallback does not switch after selection changes during add', async () => {
  let active = true
  const { provider, calls } = wallet(({ method }) => {
    if (method === 'wallet_switchEthereumChain') throw { code: 4902 }
    if (method === 'wallet_addEthereumChain') active = false
  })
  await assert.rejects(ensureArcNetwork(provider, { chain: { id: 5042 }, assertActive: () => { if (!active) throw Error('changed') } }), { reason: 'changed', chainId: 5042 })
  assert.deepEqual(calls.map((c) => c.method), ['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'])
})
test('standalone switch rechecks selection after missing-chain fallback switch', async () => {
  let active = true, switches = 0
  const { provider } = wallet(({ method }) => {
    if (method === 'wallet_switchEthereumChain') {
      if (++switches === 1) throw { code: 4902 }
      active = false
    }
  })
  await assert.rejects(network.switchToArcNetwork(provider, { chain: { id: 5042 }, assertActive: () => { if (!active) throw Error('changed') } }), { reason: 'changed', chainId: 5042 })
})
