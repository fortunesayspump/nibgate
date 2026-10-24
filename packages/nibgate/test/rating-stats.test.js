import { describe, it, expect, vi, afterEach } from 'vitest'
import { getRatingStats, ratingHubApiUrl, readReputationStats, verifyRatingTx } from '../src/server/rating.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('rating hub routing', () => {
  it('defaults to the testnet hub when the SDK network is not configured', () => {
    vi.stubEnv('NIBGATE_PUBLIC_API_URL', '')
    vi.stubEnv('NIBGATE_PAYMENT_NETWORK', '')
    vi.stubEnv('NIBGATE_NETWORK', '')
    expect(ratingHubApiUrl()).toBe('https://testnet-api.nibgate.xyz')
  })

  it('uses the mainnet hub only for an explicit mainnet network', () => {
    vi.stubEnv('NIBGATE_NETWORK', 'mainnet')
    expect(ratingHubApiUrl()).toBe('https://api.nibgate.xyz')
  })

  it('keeps explicit hub URLs authoritative', () => {
    vi.stubEnv('NIBGATE_NETWORK', 'mainnet')
    expect(ratingHubApiUrl('https://hub.example')).toBe('https://hub.example')
  })
})

describe('getRatingStats', () => {
  it('returns hub-authoritative average and count', async () => {
    const payload = { success: true, contentId: 'c1', externalId: 'p1', contentHash: '0xabc', average: 4.5, count: 12 }
    const fetchMock = vi.fn(async () => ({ json: async () => payload }))
    vi.stubGlobal('fetch', fetchMock)
    const stats = await getRatingStats({ contentId: 'p1', hubApiUrl: 'https://hub.test' })
    expect(fetchMock).toHaveBeenCalledWith('https://hub.test/hub/reputation/ratings/stats?contentId=p1', expect.anything())
    expect(stats).toMatchObject({ average: 4.5, count: 12, contentHash: '0xabc' })
  })

  it('requires contentId and surfaces hub errors', async () => {
    await expect(getRatingStats({})).rejects.toThrow(/contentId/)
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: false, error: 'Content not found.' }) })))
    await expect(getRatingStats({ contentId: 'nope', hubApiUrl: 'https://hub.test' })).rejects.toThrow(/Content not found/)
  })
})

describe('readReputationStats', () => {
  it('requires hash, contract, and rpc', async () => {
    await expect(readReputationStats({})).rejects.toThrow(/contentHash/)
    await expect(readReputationStats({ contentHash: '0xabc' })).rejects.toThrow(/contractAddress/)
    await expect(readReputationStats({ contentHash: '0xabc', contractAddress: '0x1' })).rejects.toThrow(/rpcUrl/)
  })
})

describe('verifyRatingTx', () => {
  it('uses a healthy same-chain mirror when the primary is rate limited', async () => {
    const fetchMock = vi.fn(async (url, request) => {
      if (url.includes('primary')) return { ok: false, status: 429 }
      const method = JSON.parse(request.body).method
      return { ok: true, json: async () => method === 'eth_chainId'
        ? { result: '0x13b2' }
        : { result: { status: '0x1', transactionHash: '0xabc' } } }
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(verifyRatingTx('0xabc', ['https://primary.test', 'https://mirror.test'], 5042))
      .resolves.toMatchObject({ transactionHash: '0xabc' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rejects a wrong-chain mirror and a reverted receipt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ result: '0x4cef52' }) })))
    await expect(verifyRatingTx('0xabc', ['https://wrong.test'], 5042)).rejects.toThrow(/temporarily unavailable/)
    vi.stubGlobal('fetch', vi.fn(async (_url, request) => ({ ok: true, json: async () =>
      JSON.parse(request.body).method === 'eth_chainId' ? { result: '0x13b2' } : { result: { status: '0x0' } } })))
    await expect(verifyRatingTx('0xabc', 'https://good.test', 5042)).rejects.toThrow(/reverted/)
  })
})
