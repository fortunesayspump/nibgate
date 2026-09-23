import { describe, it, expect, vi, afterEach } from 'vitest'
import { getRatingStats, readReputationStats } from '../src/server/rating.js'

afterEach(() => vi.unstubAllGlobals())

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
