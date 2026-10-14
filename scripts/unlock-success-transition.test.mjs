// Offline controlled-hook tests. Runs the real presentation hook with React's
// state/effect boundaries and timers controlled; not a browser integration test.
import assert from 'node:assert/strict'
import { readFile } from './test-source.mjs'
import test from 'node:test'

const source = (await readFile(new URL('../packages/wallet/src/react/useUnlockReveal.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]+\n/gm, '').replaceAll('export ', '')

function harness({ reduced = false, callback = () => {} } = {}) {
  const states = [], refs = [], deps = [], cleanups = []
  const timers = new Map()
  let si = 0, ri = 0, ei = 0, effects = [], timerId = 0, now = 0
  let scope = {}, onUnlock = callback
  const hooks = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value }] },
    useRef(initial) { const i = ri++; return refs[i] ||= { current: initial } },
    useCallback: (fn) => fn,
    useEffect(fn, next) {
      const i = ei++
      if (!deps[i] || next.some((value, j) => value !== deps[i][j])) {
        deps[i] = next
        effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() })
      }
    },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    window: { matchMedia: () => ({ matches: reduced }) },
  }
  const useUnlockReveal = new Function(...Object.keys(hooks), `${source}\nreturn useUnlockReveal`)(...Object.values(hooks))
  const render = () => {
    si = 0; ri = 0; ei = 0; effects = []
    const result = useUnlockReveal({ scope, onUnlock })
    effects.forEach((fn) => fn())
    return result
  }
  const advance = (ms) => {
    now += ms
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn() }
  }
  return { render, advance, scope: () => { scope = {} }, callback: (fn) => { onUnlock = fn }, unmount: () => cleanups.forEach(fn => fn?.()), timers }
}

const verified = { ok: true, payload: { ok: true, unlockProof: 'verified', content: 'Premium article' } }

test('a transaction hash, pending result or failed verification cannot show success', () => {
  const h = harness()
  const view = h.render()
  for (const result of [{ txHash: '0xabc' }, { ok: false }, { ok: 'true' }, { ok: true }, { ok: true, payload: { ok: false } }, null]) view.onVerified(result)
  assert.equal(h.render().phase, 'locked')
  assert.equal(h.timers.size, 0)
})

test('verified access gets one short confirmation before content and host notification', () => {
  const calls = []
  const h = harness({ callback: (result) => calls.push(result) })
  h.render().onVerified(verified)
  assert.equal(h.render().phase, 'confirmed')
  assert.equal(calls.length, 0)
  h.advance(599)
  assert.equal(h.render().phase, 'confirmed')
  h.advance(1)
  assert.equal(h.render().phase, 'revealed')
  assert.deepEqual(calls, [verified])
  h.render().onVerified(verified)
  h.advance(1000)
  assert.equal(calls.length, 1)
})

test('restored access skips confirmation, animation and artificial delay', () => {
  const calls = []
  const h = harness({ callback: (result) => calls.push(result) })
  h.render().onVerified(verified, { restored: true })
  h.render()
  assert.equal(h.render().phase, 'restored-content')
  assert.equal(h.timers.size, 0)
  assert.deepEqual(calls, [verified])
})

test('concurrent restored access does not cut short a fresh success state', () => {
  const calls = []
  const h = harness({ callback: (result) => calls.push(result) })
  h.render().onVerified(verified)
  h.render().onVerified(verified, { restored: true })
  assert.equal(h.render().phase, 'confirmed')
  assert.equal(calls.length, 0)
  h.advance(600)
  assert.equal(h.render().phase, 'revealed')
  assert.equal(calls.length, 1)
})

test('reduced motion has a static, minimal confirmation interval', () => {
  let count = 0
  const h = harness({ reduced: true, callback: () => count++ })
  h.render().onVerified(verified)
  h.render()
  h.advance(119)
  assert.equal(count, 0)
  h.advance(1)
  assert.equal(h.render().phase, 'revealed')
  assert.equal(count, 1)
})

for (const interrupted of ['close', 'resource navigation', 'account change', 'provider change', 'disconnect before address clears']) {
  test(`${interrupted} cancels delayed host callbacks and rejects late verification`, () => {
    let count = 0
    const h = harness({ callback: () => count++ })
    const old = h.render()
    old.onVerified(verified)
    h.render()
    if (interrupted === 'close' || interrupted === 'resource navigation') h.unmount()
    else { h.scope(); assert.equal(h.render().phase, 'locked'); h.render() }
    h.advance(2000)
    old.onVerified(verified)
    assert.equal(count, 0)
    assert.equal(h.timers.size, 0)
  })
}

test('the new wallet scope may verify without inheriting an old result', () => {
  const calls = []
  const h = harness({ callback: result => calls.push(result) })
  const old = h.render()
  old.onVerified(verified)
  h.render()
  h.scope(); h.render()
  const next = { ok: true, payload: { ok: true, content: 'New wallet content' } }
  h.render().onVerified(next)
  h.render()
  old.onVerified(verified)
  h.advance(600)
  assert.deepEqual(calls, [next])
})

test('host rerenders do not restart the timer or use a stale callback', () => {
  let oldCalls = 0, newCalls = 0
  const h = harness({ callback: () => oldCalls++ })
  h.render().onVerified(verified)
  h.render()
  h.advance(400)
  h.callback(() => newCalls++)
  h.render()
  h.advance(200)
  assert.equal(oldCalls, 0)
  assert.equal(newCalls, 1)
})

test('clearing access cancels confirmation, ignores the old attempt, and allows a fresh unlock', () => {
  const calls = []
  const h = harness({ callback: result => calls.push(result) })
  const old = h.render()
  old.onVerified(verified)
  h.render().reset()
  h.render()
  old.onVerified(verified)
  h.advance(600)
  assert.equal(h.render().phase, 'locked')
  assert.equal(calls.length, 0)
  h.render().onVerified(verified)
  h.render()
  h.advance(600)
  assert.equal(h.render().phase, 'revealed')
  assert.equal(calls.length, 1)
})
