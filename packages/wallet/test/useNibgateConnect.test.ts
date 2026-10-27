// @vitest-environment jsdom
// Isolated hook tests: all account, provider, SIWE and AppKit APIs are test mocks.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ account: {}, state: {}, provider: null, events: null }))
vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: async () => {}, close: async () => {} }),
  useAppKitState: () => fixture.state,
  useAppKitAccount: () => fixture.account,
  useAppKitProvider: () => ({ walletProvider: fixture.provider }),
  modal: { subscribeEvents: callback => { fixture.events = callback; return () => { fixture.events = null } } },
}))
vi.mock('../src/react/authorize.js', () => ({ ensureWalletAuthorized: vi.fn(async () => {}) }))
vi.mock('../src/react/siwe.js', () => ({ signInWithSiwe: vi.fn(async () => {}), signMessageWithProvider: vi.fn() }))
import { signInWithSiwe } from '../src/react/siwe.js'
import { useNibgateConnect } from '../src/react/useNibgateConnect.js'
let root, hook
function Probe() { hook = useNibgateConnect(); return null }
async function render() { await act(async () => root.render(React.createElement(Probe))) }
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.clearAllMocks()
  fixture.account = { isConnected: false }
  fixture.state = { open: false, connectingWallet: false }
  fixture.provider = null
  root = createRoot(document.createElement('div'))
  await render()
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers() })
const address = '0x1111111111111111111111111111111111111111'
const provider = () => ({ request: vi.fn(async () => '0x1') })
test('selection then success in one React batch retains intent and authenticates once', async () => {
  let pending
  await act(async () => { pending = hook.requestSignIn() })
  fixture.account = { isConnected: true, address }
  fixture.provider = provider()
  await act(async () => {
    fixture.events({ timestamp: 1, data: { event: 'SELECT_WALLET' } })
    fixture.events({ timestamp: 2, data: { event: 'CONNECT_SUCCESS' } })
    root.render(React.createElement(Probe))
  })
  await act(async () => { await vi.advanceTimersByTimeAsync(200) })
  expect(await pending).toBe(true)
  expect(signInWithSiwe).toHaveBeenCalledTimes(1)
})
test('silent hydration without selection never signs and duplicate request returns false', async () => {
  let pending
  await act(async () => { pending = hook.requestSignIn() })
  expect(await hook.requestSignIn()).toBe(false)
  fixture.account = { isConnected: true, address }
  fixture.provider = provider()
  await render()
  await act(async () => {
    fixture.events({ timestamp: 2, data: { event: 'CONNECT_SUCCESS' } })
    await vi.advanceTimersByTimeAsync(6200)
  })
  expect(await pending).toBe(false)
  expect(signInWithSiwe).not.toHaveBeenCalled()
})
test('disconnected retained provider is not signed before selected provider arrives', async () => {
  const stale = provider()
  fixture.provider = stale
  await render()
  let pending
  await act(async () => { pending = hook.requestSignIn() })
  fixture.account = { isConnected: true, address }
  await act(async () => {
    fixture.events({ timestamp: 1, data: { event: 'SOCIAL_LOGIN_STARTED' } })
    root.render(React.createElement(Probe))
  })
  await act(async () => { await vi.advanceTimersByTimeAsync(200) })
  expect(signInWithSiwe).not.toHaveBeenCalled()
  fixture.provider = provider()
  await render()
  await act(async () => { await vi.advanceTimersByTimeAsync(200) })
  expect(await pending).toBe(true)
  expect(signInWithSiwe).toHaveBeenCalledTimes(1)
})
