import { describe, it, expect } from 'vitest'
import { feePolicy, feeWalletAddressFor, resolvePayTo, createTransferVerifier, runHostedTransferRequirement, runHostedPayRequirement, ARC_USDC, ARC_TESTNET_CHAIN, DEFAULT_FEE_BPS, DEFAULT_MAX_FEE_BPS, DEFAULT_TREASURY } from '../src/server/fee-wallet.js'

describe('feePolicy', () => {
  it('uses the 1% default on Arc testnet', () => {
    const policy = feePolicy()
    expect(policy.feeBps).toBe(DEFAULT_FEE_BPS)
    expect(policy.maxFeeBps).toBe(DEFAULT_MAX_FEE_BPS)
    expect(policy.treasury).toBe(DEFAULT_TREASURY)
    expect(policy.chain).toBe(ARC_TESTNET_CHAIN)
  })

  it('accepts overrides', () => {
    const policy = feePolicy({ feeBps: 200, maxFeeBps: 500, treasury: '0x1111111111111111111111111111111111111111', chain: 'eip155:1' })
    expect(policy.feeBps).toBe(200)
    expect(policy.maxFeeBps).toBe(500)
    expect(policy.treasury).toBe('0x1111111111111111111111111111111111111111')
    expect(policy.chain).toBe('eip155:1')
  })
})

describe('resolvePayTo', () => {
  const creator = '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12'

  it('returns the creator EOA when self-hosted', () => {
    expect(resolvePayTo(creator, { hosted: false })).toBe(creator)
  })

  it('falls back to the creator when no fee wallet factory is configured', () => {
    expect(resolvePayTo(creator, { hosted: true })).toBe(creator)
  })

  it('resolves to the fee wallet for hosted content when configured', () => {
    const feeWallet = feeWalletAddressFor(creator, {
      feeWalletFactory: '0x1111111111111111111111111111111111111111',
      feeWalletTemplateHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
    })
    expect(resolvePayTo(creator, {
      hosted: true,
      feeWalletFactory: '0x1111111111111111111111111111111111111111',
      feeWalletTemplateHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
    })).toBe(feeWallet)
    expect(feeWallet).not.toBe(creator)
  })
})

describe('feeWalletAddressFor', () => {
  it('returns null without a configured factory', () => {
    expect(feeWalletAddressFor('0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12')).toBeNull()
  })

  it('derives a deterministic CREATE2 address', () => {
    const opts = {
      feeWalletFactory: '0x1111111111111111111111111111111111111111',
      feeWalletTemplateHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
    }
    const a = feeWalletAddressFor('0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12', opts)
    const b = feeWalletAddressFor('0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12', opts)
    expect(a).toBe(b)
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})

describe('createTransferVerifier', () => {
  const creator = '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12'

  it('returns a function that rejects missing tx hashes', async () => {
    const verifier = createTransferVerifier({ rpcUrl: 'https://rpc.invalid' })
    expect(await verifier({ resource: { recipient: creator }, txHash: '', payment: {} })).toBe(false)
  })

  it('returns false when the recipient is missing', async () => {
    const verifier = createTransferVerifier({ rpcUrl: 'https://rpc.invalid' })
    expect(await verifier({ resource: {}, txHash: '0xabc', payment: {} })).toBe(false)
  })

  it('returns false when the RPC is unreachable', async () => {
    const verifier = createTransferVerifier({ rpcUrl: 'https://rpc.invalid', recipient: creator })
    expect(await verifier({ resource: { recipient: creator }, txHash: '0xabc', payment: { amount: 1 } })).toBe(false)
  })
})

describe('runHostedTransferRequirement', () => {
  const creator = '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12'

  it('serves a 402 transfer challenge when no tx is presented', async () => {
    const result = await runHostedTransferRequirement(
      { headers: {} },
      { id: 'post-1', title: 'Post', price: '1.5', recipient: creator },
      { hosted: true },
    )
    expect(result.handled).toBe(true)
    expect(result.response.status).toBe(402)
    const body = await result.response.json()
    expect(body.scheme).toBe('exact')
    expect(body.paymentRail).toBe('transfer')
    expect(body.accepts[0].payTo).toBe(creator)
    expect(body.accepts[0].amount).toBe('1.5')
  })

  it('verifies an accepted transfer via the injected verifier', async () => {
    const verifyTransfer = async () => true
    const result = await runHostedTransferRequirement(
      { headers: { 'x-nibgate-transfer-tx': '0xdeadbeef' } },
      { id: 'post-1', title: 'Post', price: '1.5', recipient: creator },
      { hosted: true, verifyTransfer },
    )
    expect(result.handled).toBe(false)
    expect(result.payment.paymentProvider).toBe('direct-transfer')
    expect(result.payment.txHash).toBe('0xdeadbeef')
    expect(result.payment.recipient).toBe(creator)
    expect(result.payment.verified).toBe(true)
  })

  it('rejects an unverified transfer with 402', async () => {
    const verifyTransfer = async () => false
    const result = await runHostedTransferRequirement(
      { headers: { 'payment-signature': '0xdeadbeef' } },
      { id: 'post-1', title: 'Post', price: '1.5', recipient: creator },
      { hosted: true, verifyTransfer },
    )
    expect(result.handled).toBe(true)
    expect(result.response.status).toBe(402)
    const body = await result.response.json()
    expect(body.error).toContain('verification failed')
  })
})

describe('runHostedPayRequirement rail branching', () => {
  const creator = '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12'

  it('routes transfer rail to the hosted transfer requirement', async () => {
    const result = await runHostedPayRequirement(
      { headers: {} },
      { id: 'post-1', title: 'Post', price: '1.5', recipient: creator, paymentRail: 'transfer' },
      { hosted: true, verifyTransfer: async () => true },
    )
    expect(result.handled).toBe(true)
    expect(result.response.status).toBe(402)
    const body = await result.response.json()
    expect(body.paymentRail).toBe('transfer')
  })

  it('serves a transfer challenge from options.paymentRail even when the resource is defaulted to gateway', async () => {
    const result = await runHostedTransferRequirement(
      { headers: {} },
      { id: 'post-1', title: 'Post', price: '1.5', recipient: creator },
      { hosted: true, paymentRail: 'transfer' },
    )
    expect(result.handled).toBe(true)
    const body = await result.response.json()
    expect(body.paymentRail).toBe('transfer')
  })
})