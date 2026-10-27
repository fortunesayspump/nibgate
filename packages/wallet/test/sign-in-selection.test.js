import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { waitForSignInSelection } from '../src/react/sign-in-selection.js'

// Simulated auth snapshots only: these tests never contact accounts, wallets,
// research, or payments.
const address = '0x1111111111111111111111111111111111111111'
const provider = {}
const idle = { selectionRevision: 0, mounted: true, open: false, connecting: false, connected: false, address: null, provider: null }
async function run(initial, snapshots) {
  let tick = 0
  let index = 0
  return waitForSignInSelection({
    initial,
    read: () => ({ ...idle, ...snapshots[Math.min(index++, snapshots.length - 1)] }),
    pause: async ms => { tick += ms },
    now: () => tick,
  })
}
test('new Google or wallet connection returns selected address after reconciliation', async () => {
  assert.deepEqual(await run(idle, [{ open: true }, { connecting: true, selectionRevision: 1 }, { connected: true, address, provider, selectionRevision: 1 }]), { address, provider })
})
test('dismissal without selection returns null', async () => {
  assert.equal(await run(idle, [{ open: true }, {}]), null)
})
test('opening or dismissing with a connected wallet never requests implicit sign-in', async () => {
  const connected = { connected: true, address, provider }
  assert.equal(await run(connected, [{ ...connected, open: true }, connected]), null)
})
test('provider identity churn and account changes do not authorize an existing wallet', async () => {
  assert.equal(await run({ connected: true, address, provider }, [{ connected: true, address, provider: {} }]), null)
  assert.equal(await run({ connected: true, address, provider }, [{ connected: true, address: '0x2222222222222222222222222222222222222222', provider }]), null)
})
test('unmount abandons a pending request before signing', async () => {
  assert.equal(await run(idle, [{ open: true }, { mounted: false, connected: true, address, provider }]), null)
})
test('stuck mobile connector returns null instead of waiting indefinitely', async () => {
  assert.equal(await run(idle, [{ connecting: true }]), null)
})
test('shared hook guards duplicate requests and uses Connect, not legacy direct connect', () => {
  const source = readFileSync(new URL('../src/react/useNibgateConnect.js', import.meta.url), 'utf8')
  const flow = source.slice(source.indexOf('const requestSignIn ='), source.indexOf('// Full sign-out:'))
  assert.match(flow, /if \(runningRef.current\) return false/)
  assert.match(flow, /await open\(\{ view: 'Connect' \}\)/)
  assert.doesNotMatch(flow, /connectLegacyDirect|detectSilentSession/)
  assert.ok(flow.indexOf('if (!selection)') < flow.indexOf('await sign(selection.address'))
})

test('silent hydration and CONNECT_SUCCESS without a new selection cannot sign', async () => {
  assert.equal(await run(idle, [{ open: true }, { connected: true, address, provider }]), null)
})
test('a selection from a previous dialog is not consent for this attempt', async () => {
  assert.equal(await run({ ...idle, selectionRevision: 2 }, [{ connected: true, address, provider, selectionRevision: 2 }]), null)
})
test('hook counts user selection events, not connection success', () => {
  const source = readFileSync(new URL('../src/react/useNibgateConnect.js', import.meta.url), 'utf8')
  const effect = source.slice(source.indexOf('useEffect(() => {'), source.indexOf('const addressRef'))
  assert.match(effect, /SELECT_WALLET/)
  assert.match(effect, /SOCIAL_LOGIN_STARTED/)
  assert.doesNotMatch(effect, /CONNECT_SUCCESS/)
})

test('explicitly selecting a replacement account or provider can continue', async () => {
  const initial = { ...idle, connected: true, address, provider }
  const replacement = '0x2222222222222222222222222222222222222222'
  assert.deepEqual(await run(initial, [{ connected: true, address: replacement, provider, selectionRevision: 1 }]), { address: replacement, provider })
  const googleProvider = {}
  assert.deepEqual(await run(initial, [{ connected: true, address, provider: googleProvider, selectionRevision: 1 }]), { address, provider: googleProvider })
})
test('choosing the unchanged connected wallet still requires explicit Sign in', async () => {
  const initial = { ...idle, connected: true, address, provider }
  assert.equal(await run(initial, [{ connected: true, address, provider, selectionRevision: 1 }]), null)
})
test('selected provider is pinned before any signature request', () => {
  const source = readFileSync(new URL('../src/react/useNibgateConnect.js', import.meta.url), 'utf8')
  assert.match(source, /expectedProvider: selection.provider/)
  assert.ok(source.indexOf('provider !== expectedProvider') < source.indexOf('await signInWithSiwe'))
})

test('retained disconnected provider waits for selected provider reconciliation', async () => {
  const freshProvider = {}
  const initial = { ...idle, provider }
  const result = await run(initial, [
    { connected: true, address, provider, selectionRevision: 1 },
    { connected: true, address, provider: freshProvider, selectionRevision: 1 },
  ])
  assert.equal(result.provider, freshProvider)
})
test('stale disconnected provider alone never becomes a signing snapshot', async () => {
  assert.equal(await run({ ...idle, provider }, [{ connected: true, address, provider, selectionRevision: 1 }]), null)
})
test('hook subscribes directly so React does not coalesce selection and success', () => {
  const source = readFileSync(new URL('../src/react/useNibgateConnect.js', import.meta.url), 'utf8')
  assert.match(source, /appKitModal\?\.subscribeEvents/)
  assert.doesNotMatch(source, /useAppKitEvents/)
})
