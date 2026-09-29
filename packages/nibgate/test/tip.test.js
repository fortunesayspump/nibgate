import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'node:http'
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
    expect(c.nibgate.holdPolicy).toMatch(/refundable/i)
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
    // The Circle middleware asks the facilitator which networks it supports
    // before it can advertise a challenge. Point it at a local stub so the
    // test is hermetic (no external facilitator, no timeouts).
    const facilitator = createServer((req, res) => {
      if (req.url === '/v1/x402/supported') {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          kinds: [{
            network: 'eip155:5042002',
            extra: {
              verifyingContract: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
              assets: [{ symbol: 'USDC', address: '0x3600000000000000000000000000000000000000' }],
            },
          }],
        }))
        return
      }
      res.statusCode = 404
      res.end('{}')
    })
    await new Promise((resolve) => facilitator.listen(0, '127.0.0.1', resolve))
    const { port } = facilitator.address()
    try {
      const verifier = createTipVerifier({ facilitatorUrl: `http://127.0.0.1:${port}` })
      const out = await verifier.verifyGateway({
        req: { headers: {}, method: 'POST' },
        resource: { contentUrl: 'https://example.com/essay', title: 'Essay' },
        recipient: feeWallet,
        amount: '0.25',
        network: 'eip155:5042002',
      })
      expect(out.handled).toBe(true)
      expect(out.response.status).toBe(402)
    } finally {
      await new Promise((resolve) => facilitator.close(resolve))
    }
  })
})

describe('browser hold + refund helpers', () => {
  it('holds a tip to the domain box when the creator is unresolved', async () => {
    const { holdTipContent } = await import('../src/browser/tip.js')
    const calls = []
    const fetchMock = vi.fn(async (url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : null })
      if (String(url).endsWith('/hub/tips/hold')) {
        const body = JSON.parse(init.body)
        if (body.txHash) return { ok: true, status: 200, json: async () => ({ success: true, holdStatus: 'held', tip: { id: 't1' } }) }
        return { ok: true, status: 200, json: async () => ({ success: true, holdStatus: 'challenge', box: '0xbox' }) }
      }
      return { ok: false, status: 404, json: async () => ({ error: 'nope' }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const signer = { address: '0x0000000000000000000000000000000000000009', sendTransaction: vi.fn(async () => '0xtx') }
    try {
      const out = await holdTipContent({ contentUrl: 'https://ext.example/post', title: 'P', amount: '0.05', signer, hubApi: 'https://hub.test' })
      expect(out.held).toBe(true)
      expect(out.status).toBe('held')
      expect(out.domain).toBe('ext.example')
      expect(out.box).toBe('0xbox')
      expect(out.txHash).toBe('0xtx')
      expect(signer.sendTransaction).toHaveBeenCalledWith({ to: '0xbox', amount: '0.05', network: 'eip155:5042002' })
      expect(calls[1].body.txHash).toBe('0xtx')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('tipContent falls back to a hold when no recipient resolves', async () => {
    const { tipContent } = await import('../src/browser/tip.js')
    let holdCalls = 0
    const fetchMock = vi.fn(async (url, init) => {
      const u = String(url)
      if (u.includes('/hub/resolve')) return { ok: true, status: 200, json: async () => ({}) }
      if (u.endsWith('/hub/tips/hold')) {
        holdCalls += 1
        const body = JSON.parse(init.body)
        return { ok: true, status: 200, json: async () => (body.txHash ? { holdStatus: 'held', tip: {} } : { box: '0xbox' }) }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const signer = { address: '0x0000000000000000000000000000000000000009', sendTransaction: vi.fn(async () => '0xtx') }
    try {
      const out = await tipContent({ contentUrl: 'https://ext.example/post', title: 'P', amount: '0.05', signer, hubApi: 'https://hub.test' })
      expect(out.held).toBe(true)
      expect(holdCalls).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refundTip signs a control message and relays to the hub', async () => {
    const { refundTip } = await import('../src/browser/tip.js')
    let posted = null
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      posted = JSON.parse(init.body)
      return { ok: true, status: 200, json: async () => ({ success: true, amount: 0.05, refundTx: '0xr' }) }
    }))
    const signer = { address: '0x0000000000000000000000000000000000000009', signMessage: vi.fn(async () => '0xsig') }
    try {
      const out = await refundTip({ domain: 'ext.example', signer, hubApi: 'https://hub.test' })
      expect(out.refundTx).toBe('0xr')
      expect(posted.payer).toBe(signer.address)
      expect(posted.signature).toBe('0xsig')
      expect(signer.signMessage).toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('normalizes gateway base units to decimals for transfer-only signers', async () => {
    const { tipContent } = await import('../src/browser/tip.js')
    let verifyBody = null
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url)
      if (u.includes('/hub/resolve')) return { ok: true, status: 200, json: async () => ({ wallet: '0x0000000000000000000000000000000000000001' }) }
      if (u.endsWith('/hub/tips/verify')) {
        verifyBody = JSON.parse(init.body)
        return { ok: true, status: 200, json: async () => ({ success: true }) }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    }))
    // A gateway challenge quotes integer base units; the signer can only transfer.
    const challenge = {
      paymentRail: 'gateway',
      accepts: [{ payTo: '0x0000000000000000000000000000000000000002', amount: '50000', network: 'eip155:5042002', extra: { name: 'GatewayWalletBatched' } }],
    }
    const signer = { address: '0x0000000000000000000000000000000000000009', sendTransaction: vi.fn(async () => '0xtx') }
    try {
      const out = await tipContent({ contentUrl: 'https://x.y', amount: '0.05', contentId: 'cid-1', imageUrl: 'https://x.y/cover.png', recipient: '0x0000000000000000000000000000000000000001', challenge, signer, hubApi: 'https://hub.test' })
      expect(signer.sendTransaction).toHaveBeenCalledWith({ to: '0x0000000000000000000000000000000000000002', amount: 0.05, network: 'eip155:5042002' })
      expect(out.amount).toBe(0.05)
      expect(verifyBody.paymentRail).toBe('transfer')
      expect(verifyBody.amount).toBe(0.05)
      expect(verifyBody.contentId).toBe('cid-1')
      expect(verifyBody.imageUrl).toBe('https://x.y/cover.png')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('holdTipContent forwards content metadata to the hub', async () => {
    const { holdTipContent } = await import('../src/browser/tip.js')
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body)
      bodies.push(body)
      if (body.txHash) return { ok: true, status: 200, json: async () => ({ success: true, holdStatus: 'held', tip: {} }) }
      return { ok: true, status: 200, json: async () => ({ success: true, holdStatus: 'challenge', box: '0xbox' }) }
    }))
    const signer = { address: '0x0000000000000000000000000000000000000009', sendTransaction: vi.fn(async () => '0xtx') }
    try {
      await holdTipContent({ contentUrl: 'https://ext.example/post', contentId: 'cid-9', imageUrl: 'https://ext.example/c.png', title: 'P', amount: '0.05', signer, hubApi: 'https://hub.test' })
      expect(bodies).toHaveLength(2)
      for (const b of bodies) {
        expect(b.contentId).toBe('cid-9')
        expect(b.imageUrl).toBe('https://ext.example/c.png')
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
