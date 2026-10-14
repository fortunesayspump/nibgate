// Offline regressions for shared React component defaults. Executes the actual
// initializer/selection expressions; no wallet, network or transaction calls.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { normalizePaymentRail } from '../packages/nibgate/src/core/payment.js'
const source = await readFile(new URL('../packages/wallet/src/react/unlock.jsx', import.meta.url), 'utf8')
const initializer = source.match(/const \[paymentRail, setPaymentRail\] = useState\(([^\n]+)\)/)?.[1]
assert.ok(initializer, 'Shared unlock initializer must be present')
const initialRail = new Function('resource', `return ${initializer}`)

test('shared unlock starts on Direct when no choice was supplied', () => {
  for (const paymentRail of [undefined, '', null]) assert.equal(initialRail({ paymentRail }), 'transfer')
})

test('an explicit creator Gateway or Direct choice is honored', () => {
  assert.equal(initialRail({ paymentRail: 'gateway' }), 'gateway')
  assert.equal(initialRail({ paymentRail: 'transfer' }), 'transfer')
})

test('initial defaults do not reset an existing user selection on rerender', () => {
  let current, initialized = false
  const useState = (value) => {
    if (!initialized) { current = value; initialized = true }
    return [current, (next) => { current = next }]
  }
  const render = new Function('resource', 'useState', `return useState(${initializer})`)
  const [first, select] = render({}, useState)
  assert.equal(first, 'transfer')
  select('gateway')
  assert.equal(render({}, useState)[0], 'gateway')
  select('transfer')
  assert.equal(render({ paymentRail: 'gateway' }, useState)[0], 'transfer')
})

test('a selected rail and an issued challenge retain precedence over fallback defaults', () => {
  const selectedExpression = source.match(/const rail = (railRef\.current[^\n]+)/)?.[1]
  assert.ok(selectedExpression)
  const selected = new Function('railRef', 'resource', `return ${selectedExpression}`)
  assert.equal(selected({ current: 'gateway' }, {}), 'gateway')
  assert.equal(selected({ current: 'transfer' }, { paymentRail: 'gateway' }), 'transfer')
  assert.equal(selected({ current: '' }, {}), 'transfer')
  const challengeExpression = source.match(/const rail = (input\?\.challenge\?\.paymentRail[^\n]+)/)?.[1]
  const challenged = new Function('input', 'railRef', 'resource', `return ${challengeExpression}`)
  assert.equal(challenged({ challenge: { paymentRail: 'gateway' } }, { current: 'transfer' }, {}), 'gateway')
  assert.equal(challenged({ challenge: { paymentRail: 'transfer' } }, { current: 'gateway' }, {}), 'transfer')
})

test('both choices are sent explicitly to the server, including the new Direct default', () => {
  const start = source.indexOf('const accessPathFor = useCallback(')
  const end = source.indexOf('\n  }, [resource.paymentRail, resource.path])', start)
  assert.ok(start !== -1 && end !== -1)
  const callback = source.slice(start, end + '\n  }'.length)
  const evaluate = new Function('addressRef', 'railRef', 'resource', 'useCallback', `${callback}); return accessPathFor`)
  for (const rail of ['', 'transfer', 'gateway']) {
    const pathFor = evaluate({ current: '0xbuyer' }, { current: rail }, { path: '/post' }, (fn) => fn)
    const url = new URL(pathFor('/access'), 'https://creator.test')
    assert.equal(url.searchParams.get('rail'), rail || 'transfer')
    assert.equal(url.searchParams.get('path'), '/post')
  }
})

test('standalone unlock UI defaults Direct and keeps both rail buttons', () => {
  assert.match(source, /paymentRail = 'transfer', setPaymentRail/)
  assert.match(source, /setPaymentRail\?\.\('gateway'\)/)
  assert.match(source, /setPaymentRail\?\.\('transfer'\)/)
})

test('tip component stays Direct while generic SDK and Gateway defaults are unchanged', async () => {
  const tip = await readFile(new URL('../packages/wallet/src/react/tip.jsx', import.meta.url), 'utf8')
  assert.match(tip, /recipient: recipient \|\| resource\?\.recipient \|\| payToAddr, paymentRail: 'transfer'/)
  assert.equal(normalizePaymentRail(), 'gateway')
  assert.equal(normalizePaymentRail('gateway'), 'gateway')
})


test('Direct is the first/left tab and Gateway is second, with matching selected states', () => {
  const selector = source.slice(source.indexOf('aria-label="Payment rail"'));
  const tabs = [...selector.matchAll(/<button\b[\s\S]*?<\/button>/g)].slice(0, 2).map(([button]) => button);
  assert.equal(tabs.length, 2);
  assert.match(tabs[0], /setPaymentRail\?\.\('transfer'\)/);
  assert.match(tabs[0], /aria-selected=\{isDirect\}/);
  assert.match(tabs[0], />\s*Direct\s*<\/button>/);
  assert.match(tabs[1], /setPaymentRail\?\.\('gateway'\)/);
  assert.match(tabs[1], /aria-selected=\{!isDirect\}/);
  assert.match(tabs[1], />\s*Gateway\s*<\/button>/);
})
