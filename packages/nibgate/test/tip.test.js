import { describe, it, expect, vi } from 'vitest'
import { createTipChallenge, tipReceipt, resolveTipRecipient, resolveTipPayee, createTipRequirement, createTipVerifier } from '../src/server/tip.js'

describe('tip challenge', () => {
  it('builds an x402-style envelope without requiring locked content', () => {
    const c = createTipChallenge(
      { contentUrl: 'https://example.com/essay', title: 'Essay', amount: '0.25', recipient: '0x0000000000000000000000000000000000000001' },
      { network: 'eip155:5042002' },
    )
    expect(c.status).toBe(402)
    expect(c.nibgate.tip).toBe(true)
    expect(c.accepts[0].payTo).toBe('0x0000000000000000000000000000000000000001')
    expect(c.accepts[0].network).toBe('eip155:5042002')
    expect(c.nibgate.holdPolicy).toMatch(/no refunds/i)
  })

  it('rejects missing url and non-positive amounts', () => {
    expect(() => createTipChallenge({ amount: '1' })).toThrow(/contentUrl/)
    expect(() => createTipChallenge({ contentUrl: 'https://x.y', amount: '0' })).toThrow(/amount/)
  })

  it('encodes gateway acceptances in base units, transfer in decimal', () => {
    const recipient = '0x0000000000000000000000000000000000000001'
    const transfer = createTipChallenge(
      { contentUrl: 'https://x.y', amount: '0.05', recipient },
      { paymentRail: 'transfer' },
    )
    expect(transfer.paymentRail).toBe('transfer')
    expect(transfer.accepts[0].amount).toBe('0.05')
    expect(transfer.accepts[0].extra).toBeUndefined()

    const gateway = createTipChallenge(
      { contentUrl: 'https://x.y', amount: '0.05', recipient },
      { paymentRail: 'gateway', network: 'eip155:5042002' },
    )
    expect(gateway.paymentRail).toBe('gateway')
    // Circle's EIP-3009 authorization value is an integer string.
    expect(gateway.accepts[0].amount).toBe('50000')
    expect(gateway.accepts[0].extra?.name).toBe('GatewayWalletBatched')
    expect(gateway.nibgate.amount).toBe('0.05')
  })

  it('receipts carry type tip and no access grant', () => {
    const r = tipReceipt({ contentUrl: 'https://x.y/a', amount: '1', payerWallet: '0xp', recipient: '0xr', txHash: '0xt' })
    expect(r.type).toBe('tip')
    expect(r.amount).toBe(1)
    expect('access' in r).toBe(false)
  })
})

describe('resolveTipRecipient', () => {
  it('returns unresolved without hints or hub', async () => {
    const r = await resolveTipRecipient({ url: 'https://unknown.example/post' })
    expect(r.state).toBe('unresolved')
  })

  it('accepts a valid wallet authorHint', async () => {
    const r = await resolveTipRecipient({ url: 'https://x.y', authorHint: '0x0000000000000000000000000000000000000001' })
    expect(r.state).toBe('resolved')
    expect(r.source).toBe('page-signal')
  })

  it('uses the hub index when it knows the wallet', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ wallet: '0x0000000000000000000000000000000000000002', confidence: 0.95 }),
    }))
    const r = await resolveTipRecipient({ url: 'https://known.example/a', hubApi: 'https://hub.test', fetchFn })
    expect(r.state).toBe('resolved')
    expect(r.source).toBe('hub-index')
  })
})

describe('tip revenue parity with unlocks', () => {
  const creator = '0x0000000000000000000000000000000000000001'
  const feeWallet = '0x0000000000000000000000000000000000000002'
  const factory = '0x0000000000000000000000000000000000000003'
  const hostedOpts = { hosted: true, feeWalletFactory: factory, predictedWallet: async () => feeWallet }

  it('resolves hosted tips to the fee wallet, self-hosted to the creator', async () => {
    expect((await resolveTipPayee(creator, hostedOpts)).toLowerCase()).toBe(feeWallet)
    expect(await resolveTipPayee(creator, { hosted: false })).toBe(creator)
    await expect(resolveTipPayee('', {})).rejects.toThrow(/recipient/)
  })

  it('createTipRequirement attaches payee, fee policy, and a matching challenge', async () => {
    const r = await createTipRequirement(
      { contentUrl: 'https://example.com/essay', title: 'Essay', amount: '0.25', recipient: creator },
      { network: 'eip155:5042002', ...hostedOpts },
    )
    expect(r.payee.toLowerCase()).toBe(feeWallet)
    expect(r.feeBps).toBe(100)
    expect(r.protocolFee).toBeCloseTo(0.0025, 6)
    expect(r.challenge.accepts[0].payTo.toLowerCase()).toBe(feeWallet)
  })

  it('tipReceipt carries payee and protocol fee', () => {
    const r = tipReceipt({ contentUrl: 'https://x.y', amount: '1', recipient: creator, payee: feeWallet, protocolFee: 0.01, feeBps: 100 })
    expect(r.payeeWallet).toBe(feeWallet)
    expect(r.protocolFee).toBe(0.01)
    expect(r.feeBps).toBe(100)
  })

  it('verifyGateway returns a 402 challenge when no payment signature is present', async () => {
    const verifier = createTipVerifier({})
    const out = await verifier.verifyGateway({
      req: { headers: {}, method: 'POST' },
      resource: { contentUrl: 'https://example.com/essay', title: 'Essay' },
      recipient: feeWallet,
      amount: '0.25',
      network: 'eip155:5042002',
    })
    expect(out.handled).toBe(true)
    expect(out.response.status).toBe(402)
  }, 15000)
})
