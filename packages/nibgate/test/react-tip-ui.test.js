// Offline component harness: execute the actual JSX branches with hook state
// supplied at React's boundary. Payment-flow integration lives in react-tip.test.
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const walletRequire = createRequire(new URL('../../wallet/package.json', import.meta.url))
const mocks = vi.hoisted(() => ({ state: [], index: 0, effects: [], deps: [], effectIndex: 0 }))
const element = (type, props, ...children) => ({ type, props: { ...props, children } })
vi.stubGlobal('React', { createElement: element })
vi.doMock(walletRequire.resolve('react'), () => ({
  createElement: element,
  useCallback: (fn) => fn,
  useRef: (current) => ({ current }),
  useState: (initial) => {
    const index = mocks.index++
    if (!(index in mocks.state)) mocks.state[index] = initial
    return [mocks.state[index], (value) => { mocks.state[index] = value }]
  },
  useEffect: (fn, deps) => {
    const i = mocks.effectIndex++
    if (!mocks.deps[i] || deps.some((value, n) => value !== mocks.deps[i][n])) {
      mocks.effects.push(fn)
      mocks.deps[i] = deps
    }
  },
}))
vi.doMock(walletRequire.resolve('@reown/appkit/react'), () => ({
  useAppKit: () => ({ open: vi.fn() }),
  useAppKitAccount: () => ({ address: '0x1111111111111111111111111111111111111111', isConnected: true }),
  useAppKitProvider: () => ({ walletProvider: null }),
}))
const { NibgateTipCard, NibgateTipInline } = await import('../../wallet/src/react/tip.jsx')
const settled = { status: 'settled', held: false, txHash: `0x${'ab'.repeat(32)}`, amount: 1.25, currency: 'USDC' }

function expand(node) {
  if (Array.isArray(node)) return node.flatMap((child) => expand(child))
  if (!node || typeof node !== 'object') return node
  if (typeof node.type === 'function') return expand(node.type(node.props))
  return { ...node, props: { ...node.props, children: expand(node.props.children) } }
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...nodes(tree.props.children)]
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('')
  if (!tree || typeof tree === 'boolean') return ''
  if (typeof tree !== 'object') return String(tree)
  return tree.type === 'style' ? '' : text(tree.props.children)
}
function render(Component = NibgateTipCard) {
  mocks.index = 0; mocks.effectIndex = 0; mocks.effects = []
  const tree = expand(Component({ resource: {} }))
  mocks.effects.forEach((effect) => effect())
  return tree
}
function seed(status, receipt = null, error = '', custom = '1.25') {
  mocks.state = [status, error, receipt, custom, null, false]
}
beforeEach(() => { mocks.state = []; mocks.deps = []; vi.stubGlobal('React', { createElement: element }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('tip feedback UI', () => {
  it.each([NibgateTipCard, NibgateTipInline])('renders an explicit persistent confirmation only for a settled receipt (%s)', (Component) => {
    seed('done', settled)
    const tree = render(Component)
    expect(text(tree)).toContain('Tip sent! 1.25 USDC')
    expect(nodes(tree).find((node) => node.props['data-nibgate-confirmation'] !== undefined)?.props['aria-hidden']).toBe('true')
    expect(nodes(tree).find((node) => node.props.role === 'status')?.props).toMatchObject({ 'aria-live': 'polite', 'aria-atomic': 'true' })
    expect(text(render(Component))).toContain('Tip sent! 1.25 USDC')
  })

  it.each(['connecting', 'switching', 'signing', 'verifying', 'pending', 'blocked', 'error'])('never celebrates or clears the amount during %s, even with an old settled receipt', (status) => {
    seed(status, settled)
    const tree = render()
    expect(text(tree)).not.toContain('Tip sent!')
    expect(nodes(tree).some((node) => node.props['data-nibgate-confirmation'] !== undefined)).toBe(false)
    expect(mocks.state[3]).toBe('1.25')
  })

  it.each([null, { ...settled, status: 'pending' }, { ...settled, status: 'conflict' }])('requires an authoritative receipt status, not only a done flag (%j)', (receipt) => {
    seed('done', receipt)
    expect(text(render())).not.toContain('Tip sent!')
    expect(mocks.state[3]).toBe('1.25')
  })

  it('clears the confirmed custom input while retaining the paid amount and supports the next custom tip', () => {
    seed('done', settled)
    render()
    expect(mocks.state[3]).toBe('')
    let tree = render()
    expect(nodes(tree).find((node) => node.type === 'input')?.props.value).toBe('')
    expect(text(tree)).toContain('Tip sent! 1.25 USDC')
    nodes(tree).find((node) => node.type === 'input').props.onChange({ target: { value: '2' } })
    tree = render()
    expect(mocks.state[3]).toBe('2')
    expect(text(tree)).toContain('Tip the creator')
    expect(text(tree)).toContain('Tip sent! 1.25 USDC')
  })

  it.each([NibgateTipCard, NibgateTipInline])('uses truthful, non-celebratory held-tip feedback (%s)', (Component) => {
    seed('done', { ...settled, held: true, status: 'held' })
    const tree = render(Component)
    expect(text(tree)).toContain('Tip held 1.25 USDC · awaiting the creator’s claim')
    expect(text(tree)).not.toContain('Tip sent!')
    expect(nodes(tree).some((node) => node.props['data-nibgate-confirmation'] !== undefined)).toBe(false)
  })

  it('preserves the confirmation if the host update fails after payment', () => {
    seed('done', settled, 'Your tip is confirmed, but the page could not finish updating. Do not send another tip to retry that update.')
    const tree = render()
    expect(text(tree)).toContain('Tip sent! 1.25 USDC')
    expect(text(tree)).toContain('Do not send another tip')
    expect(mocks.state[3]).toBe('')
  })

  it('keeps pending feedback and verification-only retry available with the amount preserved', () => {
    seed('pending', { ...settled, status: 'pending' }, 'Confirmation incomplete. Retry verification; no additional payment will be sent.')
    const tree = render()
    expect(text(tree)).toContain('Tip submitted. Confirmation pending.')
    expect(text(tree)).toContain('Retry verification')
    expect(nodes(tree).find((node) => node.type === 'input')?.props.disabled).toBe(true)
    expect(mocks.state[3]).toBe('1.25')
  })

  it('only animates the checkmark when reduced motion is not requested', () => {
    seed('done', settled)
    const css = nodes(render()).filter((node) => node.type === 'style').map((node) => node.props.children.join('')).join('')
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)/)
    expect(css).toContain('320ms ease-out')
    expect(css).not.toContain('infinite')
  })
})
