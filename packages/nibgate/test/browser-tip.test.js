import { afterEach, describe, expect, it, vi } from 'vitest'
import { tipContent, holdTipContent } from '../src/browser/tip.js'
import { createTipChallenge } from '../src/server/tip.js'

const creator = '0x0000000000000000000000000000000000000001'
const payer = '0x0000000000000000000000000000000000000009'
const box = '0x0000000000000000000000000000000000000002'
const contentUrl = 'https://creator.example/post'
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
const signer = () => ({ address: payer, signTypedData: vi.fn(async () => `0x${'11'.repeat(65)}`) })
const challenge = (paymentRail = 'gateway', recipient = creator, network = 'eip155:5042002') => createTipChallenge({ contentUrl, amount: '0.05', recipient }, { paymentRail, network })
afterEach(() => vi.unstubAllGlobals())

describe('browser tip payment regressions', () => {
  it('pays a Gateway challenge using the real browser adapter and surfaces the verified receipt', async () => {
    const wallet = signer()
    const fetchMock = vi.fn(async (_url, init) => {
      const proof = JSON.parse(init.body)
      expect(proof.amount).toBe(0.05)
      expect(proof.paymentRail).toBe('gateway')
      const payment = JSON.parse(Buffer.from(init.headers['payment-signature'], 'base64').toString())
      expect(payment.accepted.amount).toBe('50000')
      expect(payment.accepted.payTo).toBe(creator)
      return response({ success: true, id: 'tip-1', receipt: { txHash: '0xsettled', paymentId: 'payment-1' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await tipContent({ contentUrl, amount: '0.05', recipient: creator, challenge: challenge(), signer: wallet, hubApi: 'https://hub.test' })
    expect(wallet.signTypedData).toHaveBeenCalledOnce()
    expect(out).toMatchObject({ held: false, status: 'settled', txHash: '0xsettled', paymentId: 'payment-1', id: 'tip-1' })
  })


  it('uses transfers for transfer challenges even if a signer supports both rails', async () => {
    const wallet = { ...signer(), sendTransaction: vi.fn(async () => '0xtx') }
    await tipContent({ contentUrl, amount: '0.05', recipient: creator, challenge: challenge('transfer'), signer: wallet })
    expect(wallet.signTypedData).not.toHaveBeenCalled()
    expect(wallet.sendTransaction).toHaveBeenCalledWith({ to: creator, amount: '0.05', network: 'eip155:5042002' })
  })

  it.each([402, 500])('does not report success on failed verification (%s), preserving proof for recovery', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Verification rejected' }, status)))
    const wallet = { address: payer, sendTransaction: vi.fn(async () => '0xpaid') }
    await expect(tipContent({ contentUrl, amount: '0.05', recipient: creator, challenge: challenge('transfer'), signer: wallet, hubApi: 'https://hub.test' })).rejects.toMatchObject({
      message: expect.stringMatching(/do not pay again automatically.*0xpaid.*Verification rejected/), txHash: '0xpaid', paymentRail: 'transfer', paymentSignature: '0xpaid',
    })
    expect(wallet.sendTransaction).toHaveBeenCalledOnce()
  })

  it('does not swallow a network error after Gateway signing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(tipContent({ contentUrl, amount: '0.05', recipient: creator, challenge: challenge(), signer: signer(), hubApi: 'https://hub.test' })).rejects.toMatchObject({ message: expect.stringMatching(/verification failed.*offline/), paymentSignature: expect.any(String), paymentRail: 'gateway' })
  })




  it('supports a standalone explicit challenge without a redundant recipient', async () => {
    const wallet = { address: payer, sendTransaction: vi.fn(async () => '0xtx') }
    const out = await tipContent({ contentUrl, amount: '0.05', challenge: challenge('transfer'), signer: wallet })
    expect(out.held).toBe(false)
    expect(out.status).toBe('pending')
    expect(wallet.sendTransaction).toHaveBeenCalledOnce()
  })

  it('does not redirect an explicit challenge into a hold when creator resolution fails', async () => {
    const wallet = signer()
    const fetchMock = vi.fn(async () => response({}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(tipContent({ contentUrl, amount: '0.05', challenge: challenge(), signer: wallet, hubApi: 'https://hub.test' })).rejects.toThrow(/cannot fall back to a hold/)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(wallet.signTypedData).not.toHaveBeenCalled()
  })


  it.each(['network', 'http', 'json'])('fails before payment or hold on resolver %s failure', async (failure) => {
    const wallet = { ...signer(), sendTransaction: vi.fn() }
    const fetchMock = vi.fn(async () => {
      if (failure === 'network') throw new Error('offline')
      if (failure === 'http') return response({}, 503)
      return { ok: true, json: async () => { throw new Error('bad JSON') } }
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(tipContent({ contentUrl, amount: '0.05', signer: wallet, hubApi: 'https://hub.test' })).rejects.toThrow(/recipient lookup failed/)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(wallet.signTypedData).not.toHaveBeenCalled()
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it('rejects a direct challenge on another network before payment', async () => {
    const wallet = { ...signer(), sendTransaction: vi.fn() }
    await expect(tipContent({ contentUrl, amount: '0.05', recipient: creator, challenge: challenge('transfer', creator, 'eip155:8453'), signer: wallet })).rejects.toThrow(/network does not match/)
    expect(wallet.signTypedData).not.toHaveBeenCalled()
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it('rejects a held challenge on another network before payment', async () => {
    const wallet = { address: payer, sendTransaction: vi.fn() }
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...challenge('transfer', box, 'eip155:8453'), box })))
    await expect(holdTipContent({ contentUrl, amount: '0.05', signer: wallet, hubApi: 'https://hub.test' })).rejects.toThrow(/network does not match/)
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it.each([{}, { success: true, holdStatus: 'challenge' }, { success: false, holdStatus: 'held' }])('does not mark an unverified transfer hold successful: %j', async (body) => {
    const wallet = { address: payer, sendTransaction: vi.fn(async () => '0xpaid') }
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ box })).mockResolvedValueOnce(response(body))
    vi.stubGlobal('fetch', fetchMock)
    await expect(holdTipContent({ contentUrl, amount: '0.05', signer: wallet, hubApi: 'https://hub.test' })).rejects.toMatchObject({ txHash: '0xpaid', paymentSignature: '0xpaid', paymentRail: 'transfer' })
    expect(wallet.sendTransaction).toHaveBeenCalledOnce()
  })

  it('preserves existing transfer hold success', async () => {
    const wallet = { address: payer, sendTransaction: vi.fn(async () => '0xpaid') }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ box })).mockResolvedValueOnce(response({ success: true, holdStatus: 'held', tip: { id: 'held-1' } })))
    await expect(holdTipContent({ contentUrl, amount: '0.05', signer: wallet, hubApi: 'https://hub.test' })).resolves.toMatchObject({ held: true, status: 'held', txHash: '0xpaid', receipt: { id: 'held-1' } })
  })
  it('holds an unresolved creator tip using a signTypedData-only signer', async () => {
    const wallet = signer()
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).includes('/hub/resolve')) return response({})
      const body = JSON.parse(init.body)
      bodies.push(body)
      if (!body.paymentSignature) return response({ ...challenge('gateway', box), box, holdStatus: 'challenge' })
      expect(body.amount).toBe(0.05)
      expect(body.paymentRail).toBe('gateway')
      expect(init.headers['payment-signature']).toBe(body.paymentSignature)
      return response({ success: true, holdStatus: 'held', tip: { id: 'held-1' } })
    }))
    const out = await tipContent({ contentUrl, amount: '0.05', signer: wallet, hubApi: 'https://hub.test' })
    expect(out).toMatchObject({ held: true, status: 'held', amount: 0.05, box, receipt: { id: 'held-1' } })
    expect(bodies[0].paymentRail).toBe('gateway')
    expect(wallet.signTypedData).toHaveBeenCalledOnce()
  })

  it('rejects a hold payee mismatch before any payment', async () => {
    const wallet = signer()
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...challenge(), box })))
    await expect(holdTipContent({ contentUrl, amount: '0.05', signer: wallet, hubApi: 'https://hub.test' })).rejects.toThrow(/does not match/)
    expect(wallet.signTypedData).not.toHaveBeenCalled()
  })

})
