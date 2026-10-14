import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureWalletAuthorized } from '../packages/wallet/src/react/authorize.js'

const address = '0x1111111111111111111111111111111111111111'
test('connected social wallet signs in without unsupported account request', async () => {
  const methods = []
  await ensureWalletAuthorized(address, { walletProvider: { async request({ method }) {
    methods.push(method)
    if (method === 'eth_accounts') return [address]
    throw new Error('Requested RPC call is not allowed')
  } } })
  assert.deepEqual(methods, ['eth_accounts'])
})
test('unapproved injected wallet requests account access', async () => {
  const methods = []
  await ensureWalletAuthorized(address, { walletProvider: { async request({ method }) {
    methods.push(method)
    return method === 'eth_accounts' ? [] : [address]
  } } })
  assert.deepEqual(methods, ['eth_accounts', 'eth_requestAccounts'])
})
test('different selected account cannot authorize the session', async () => {
  await assert.rejects(ensureWalletAuthorized(address, { walletProvider: {
    request: async () => ['0x2222222222222222222222222222222222222222'],
  } }), { code: 'ACCOUNT_MISMATCH' })
})
test('provider errors are not bypassed with another authorization request', async () => {
  const failure = Object.assign(new Error('Disconnected'), { code: 4900 })
  await assert.rejects(ensureWalletAuthorized(address, { walletProvider: {
    request: async () => { throw failure },
  } }), failure)
})
