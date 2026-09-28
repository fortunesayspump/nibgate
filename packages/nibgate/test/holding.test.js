import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import {
  canonicalDomainKey,
  domainHashFor,
  mintHoldingAddress,
  buildHoldingRelease,
  buildHoldingRequirement,
  holdingRecipient,
  holdingDeployment,
  claimMessage,
  mintClaimToken,
  verifyClaimToken,
  createTipIntent,
} from '../src/server/holding.js'

const TEST_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const TEST_ADDR = privateKeyToAccount(TEST_KEY).address.toLowerCase()

describe('holding addresses', () => {
  it('canonicalizes domains identically', () => {
    expect(canonicalDomainKey('https://WWW.Example.com/path?q=1')).toBe('example.com')
    expect(canonicalDomainKey('example.com:3000/x')).toBe('example.com')
    expect(() => domainHashFor('')).toThrow()
    expect(domainHashFor('a.com')).not.toBe(domainHashFor('b.com'))
  })

  it('predicts stable, distinct, valid addresses', () => {
    const a = mintHoldingAddress('example.com', { factoryAddress: '0x0000000000000000000000000000000000000001', initCodeHash: '0x' + '11'.repeat(32) })
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(mintHoldingAddress('https://example.com/x', { factoryAddress: '0x0000000000000000000000000000000000000001', initCodeHash: '0x' + '11'.repeat(32) })).toBe(a)
    expect(mintHoldingAddress('other.com', { factoryAddress: '0x0000000000000000000000000000000000000001', initCodeHash: '0x' + '11'.repeat(32) })).not.toBe(a)
    expect(() => mintHoldingAddress('')).toThrow()
  })

  it('builds release calldata', () => {
    const call = buildHoldingRelease({ domain: 'example.com', creator: TEST_ADDR, factoryAddress: '0x0000000000000000000000000000000000000001' })
    expect(call.to).toBe('0x0000000000000000000000000000000000000001')
    expect(call.data.startsWith('0x')).toBe(true)
    expect(() => buildHoldingRelease({ domain: '', creator: TEST_ADDR, factoryAddress: '0x1' })).toThrow()
  })
})

describe('claim tokens', () => {
  const account = privateKeyToAccount(TEST_KEY)
  const signMessage = (message) => account.signMessage({ message })

  it('round-trips mint and verify', async () => {
    const token = await mintClaimToken({ domain: 'Example.com', wallet: TEST_ADDR, expiresAt: Date.now() + 60000 }, signMessage)
    expect(token.domain).toBe('example.com')
    expect(token.message).toContain('Nibgate tip claim')
    const out = await verifyClaimToken({ ...token, domain: 'example.com', wallet: TEST_ADDR })
    expect(out.valid).toBe(true)
    expect(out.signer).toBe(TEST_ADDR)
  })

  it('rejects mismatch, expiry, and garbage', async () => {
    const token = await mintClaimToken({ domain: 'example.com', wallet: TEST_ADDR, expiresAt: Date.now() + 60000 }, signMessage)
    expect((await verifyClaimToken({ ...token, domain: 'other.com' })).valid).toBe(false)
    expect((await verifyClaimToken({ ...token, wallet: '0x0000000000000000000000000000000000000002' })).valid).toBe(false)
    const old = await mintClaimToken({ domain: 'example.com', wallet: TEST_ADDR, expiresAt: Date.now() - 1000 }, signMessage)
    expect((await verifyClaimToken(old)).reason).toBe('expired')
    expect((await verifyClaimToken({ message: '', signature: '0x' })).valid).toBe(false)
    await expect(mintClaimToken({ domain: '', wallet: TEST_ADDR }, signMessage)).rejects.toThrow()
  })
})

describe('tip intent', () => {
  it('validates shape and floor', () => {
    const intent = createTipIntent({ url: 'https://x.y/a', title: 'A', amount: '0.5', payerWallet: TEST_ADDR })
    expect(intent.type).toBe('tip-intent')
    expect(intent.amount).toBe(0.5)
    expect(() => createTipIntent({ url: '', amount: '1' })).toThrow()
    expect(() => createTipIntent({ url: 'https://x.y', amount: '0' })).toThrow()
    expect(() => createTipIntent({ url: 'https://x.y', amount: '0.001', minAmount: 0.01 })).toThrow()
  })
})

describe('box-funding requirements', () => {
  it('exposes the testnet deployment and predicts consistent boxes', () => {
    const dep = holdingDeployment('testnet')
    expect(dep.factoryAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(dep.initCodeHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(dep.feeBps).toBe(500)
    expect(holdingRecipient('example.com')).toBe(mintHoldingAddress('example.com'))
  })

  it('resolves mainnet (by name and chain id) to the mainnet factory', () => {
    const byName = holdingDeployment('mainnet')
    const byCaip = holdingDeployment('eip155:5042')
    const byChain = holdingDeployment(5042)
    expect(byName.network).toBe('mainnet')
    expect(byName.chainId).toBe(5042)
    expect(byName.factoryAddress).toBe('0x3b25846c3332fcb8140e2ab60aad2b7fb401fe87')
    expect(byName.initCodeHash).toBe('0x94f9f922f2c114eb9c39962fdc532f66cf1e0a8b82f1f9126a23d0ce5c87886e')
    expect(byCaip.factoryAddress).toBe(byName.factoryAddress)
    expect(byChain.factoryAddress).toBe(byName.factoryAddress)
    expect(holdingDeployment('testnet').network).toBe('testnet')
  })

  it('predicts the box against the network-specific factory', () => {
    const mainnet = buildHoldingRequirement(
      { contentUrl: 'https://example.com/p', title: 'P', amount: '0.05', domain: 'example.com' },
      { network: 'mainnet' },
    )
    const testnet = buildHoldingRequirement(
      { contentUrl: 'https://example.com/p', title: 'P', amount: '0.05', domain: 'example.com' },
      { network: 'testnet' },
    )
    expect(mainnet.box).toBe(holdingRecipient('example.com', holdingDeployment('mainnet')))
    expect(mainnet.box).not.toBe(testnet.box)
    expect(mainnet.deployment.network).toBe('mainnet')
  })

  it('both rails pay the box; gateway amount is in base units', () => {
    const direct = buildHoldingRequirement(
      { contentUrl: 'http://example.com/p', title: 'P', amount: '0.05', domain: 'example.com' },
      { paymentRail: 'transfer' },
    )
    expect(direct.challenge.accepts[0].payTo).toBe(direct.box)
    expect(direct.challenge.accepts[0].amount).toBe('0.05')

    const gateway = buildHoldingRequirement(
      { contentUrl: 'http://example.com/p', title: 'P', amount: '0.05', domain: 'example.com' },
      { paymentRail: 'gateway' },
    )
    expect(gateway.challenge.accepts[0].payTo).toBe(gateway.box)
    expect(gateway.challenge.accepts[0].extra?.name).toBe('GatewayWalletBatched')
    // Gateway authorizations sign integer base units.
    expect(gateway.challenge.accepts[0].amount).toBe('50000')
  })
})
