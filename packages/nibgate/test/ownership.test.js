import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { ownershipMessage } from '../src/core/ownership.js'
import { OWNERSHIP_SIGNATURE_HEADER, verifyOwnershipSignature } from '../src/server/ownership.js'

const PK = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
const account = privateKeyToAccount(PK)
const resource = { id: 'post-1', path: '/writing/p2-paid' }

describe('ownershipMessage', () => {
  it('binds resource path and lowercased wallet deterministically', () => {
    expect(ownershipMessage(resource, '0xAbCdEf0000000000000000000000000000000012'))
      .toBe('Nibgate ownership confirmation\nresource:/writing/p2-paid\nwallet:0xabcdef0000000000000000000000000000000012')
  })

  it('falls back to url then id when path is missing', () => {
    expect(ownershipMessage({ url: 'https://x/y' }, '0xa')).toContain('resource:https://x/y')
    expect(ownershipMessage({ id: 'abc' }, '0xa')).toContain('resource:abc')
    expect(ownershipMessage({}, '0xa')).toContain('resource:')
  })
})

describe('verifyOwnershipSignature', () => {
  it('accepts a signature made by the claimed wallet', async () => {
    const signature = await account.signMessage({ message: ownershipMessage(resource, account.address) })
    const verdict = await verifyOwnershipSignature({ signature, address: account.address, resource })
    expect(verdict).toEqual({ ok: true, address: account.address.toLowerCase() })
  })

  it('rejects a signer that does not match the claimed address', async () => {
    const other = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
    const signature = await other.signMessage({ message: ownershipMessage(resource, other.address) })
    const verdict = await verifyOwnershipSignature({ signature, address: account.address, resource })
    expect(verdict.ok).toBe(false)
    expect(verdict.error).toBe('ownership-signer-mismatch')
  })

  it('rejects a signature over a different message (resource or wallet binding)', async () => {
    const signature = await account.signMessage({ message: ownershipMessage({ path: '/writing/other-post' }, account.address) })
    expect((await verifyOwnershipSignature({ signature, address: account.address, resource })).ok).toBe(false)

    const sigUpperAddrMsg = await account.signMessage({ message: 'Nibgate ownership confirmation\nresource:/writing/p2-paid\nwallet:not-the-wallet' })
    expect((await verifyOwnershipSignature({ signature: sigUpperAddrMsg, address: account.address, resource })).ok).toBe(false)
  })

  it('fails closed on empty/garbage signatures and bad addresses', async () => {
    expect((await verifyOwnershipSignature({ signature: '', address: account.address, resource })).error).toBe('ownership-signature-required')
    expect((await verifyOwnershipSignature({ signature: '0xdeadbeef', address: account.address, resource })).error).toBe('ownership-signature-invalid')
    expect((await verifyOwnershipSignature({ signature: '0x1'.padEnd(132, '1'), address: 'not-an-address', resource })).error).toBe('ownership-address-invalid')
  })

  it('exposes the canonical header name', () => {
    expect(OWNERSHIP_SIGNATURE_HEADER).toBe('x-nibgate-ownership-signature')
  })
})
