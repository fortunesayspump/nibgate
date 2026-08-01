import { describe, it, expect } from 'vitest'
import { normalizeResource, normalizeAccessPolicy, normalizeContentType, normalizeUnlockPolicy } from '../src/core/resource.js'
import { normalizePaymentRail } from '../src/core/payment.js'
import { normalizeRating } from '../src/core/rating.js'

describe('normalizeContentType', () => {
  it('passes through valid content types', () => {
    expect(normalizeContentType('article')).toBe('article')
    expect(normalizeContentType('music')).toBe('music')
    expect(normalizeContentType('video')).toBe('video')
    expect(normalizeContentType('image')).toBe('image')
  })

  it('maps aliases to canonical types', () => {
    expect(normalizeContentType('audio')).toBe('music')
    expect(normalizeContentType('song')).toBe('music')
    expect(normalizeContentType('photo')).toBe('image')
    expect(normalizeContentType('movie')).toBe('video')
  })

  it('defaults unknown types to article', () => {
    expect(normalizeContentType('unknown')).toBe('article')
    expect(normalizeContentType('')).toBe('article')
  })
})

describe('normalizeAccessPolicy', () => {
  it('handles string shorthand', () => {
    expect(normalizeAccessPolicy('free')).toEqual({ humans: 'free', agents: 'free' })
    expect(normalizeAccessPolicy('paid')).toEqual({ humans: 'paid', agents: 'paid' })
    expect(normalizeAccessPolicy('blocked')).toEqual({ humans: 'blocked', agents: 'blocked' })
  })

  it('handles object with separate human/agent policies', () => {
    expect(normalizeAccessPolicy({ humans: 'free', agents: 'paid' }))
      .toEqual({ humans: 'free', agents: 'paid' })
    expect(normalizeAccessPolicy({ human: 'free', agent: 'blocked' }))
      .toEqual({ humans: 'free', agents: 'blocked' })
  })

  it('falls back to paid for unknown values', () => {
    expect(normalizeAccessPolicy({ humans: 'invalid' })).toEqual({ humans: 'paid', agents: 'paid' })
  })
})

describe('normalizePaymentRail', () => {
  it('normalizes gateway aliases', () => {
    expect(normalizePaymentRail('gateway')).toBe('gateway')
    expect(normalizePaymentRail('circle_gateway')).toBe('gateway')
    expect(normalizePaymentRail('x402')).toBe('gateway')
  })

  it('normalizes transfer aliases', () => {
    expect(normalizePaymentRail('transfer')).toBe('transfer')
    expect(normalizePaymentRail('direct_transfer')).toBe('transfer')
    expect(normalizePaymentRail('wallet_transfer')).toBe('transfer')
  })

  it('defaults to gateway for unknown values', () => {
    expect(normalizePaymentRail('unknown')).toBe('gateway')
    expect(normalizePaymentRail('')).toBe('gateway')
  })
})

describe('normalizeUnlockPolicy', () => {
  it('passes through valid modes', () => {
    expect(normalizeUnlockPolicy({ mode: 'one_time' }).mode).toBe('one_time')
    expect(normalizeUnlockPolicy({ mode: 'metered_stream' }).mode).toBe('metered_stream')
  })

  it('normalizes string shorthand', () => {
    expect(normalizeUnlockPolicy('one_time').mode).toBe('one_time')
  })
})

describe('normalizeResource', () => {
  it('fills defaults for minimal input', () => {
    const r = normalizeResource({ id: 'test', title: 'Test' })
    expect(r.id).toBe('test')
    expect(r.title).toBe('Test')
  })

  it('normalizes access policies', () => {
    const r = normalizeResource({ id: 'test', access: { humans: 'free', agents: 'paid' } })
    expect(r.access).toEqual({ humans: 'free', agents: 'paid' })
  })

  it('computes payTo from recipient', () => {
    const r = normalizeResource({ id: 'test', recipient: '0xabc' })
    expect(r.payTo).toBe('0xabc')
    expect(r.recipient).toBe('0xabc')
  })

  it('enables ratings by default', () => {
    const r = normalizeResource({ id: 'test' })
    expect(r.ratingsEnabled).toBe(true)
  })
})

describe('normalizeRating', () => {
  it('converts 1-5 scale to 1-50 internal scale', () => {
    expect(normalizeRating({ rating: 5 }).ratingValue).toBe(50)
    expect(normalizeRating({ rating: 1 }).ratingValue).toBe(10)
    expect(normalizeRating({ rating: 3.5 }).ratingValue).toBe(35)
  })

  it('treats values > 5 as already in 1-50 scale', () => {
    expect(normalizeRating({ rating: 50 }).ratingValue).toBe(50)
    expect(normalizeRating({ rating: 10 }).ratingValue).toBe(10)
  })
})

describe('contentRatingHash derivation', () => {
  it('derives the canonical on-chain hash from resource url/id', async () => {
    const { contentRatingHash, canonicalContentHash, contentHashFor, isCanonicalContentHash } = await import('../src/browser/reputation.js')
    const expected = '0x7e99320a18f1a8ce6ad0a9776e726198f47be42bf98d5cf80058058e7e55aeee'
    expect(contentHashFor('benedict.nibgate.xyz', 'ec845c35-ebc2-490b-b8a5-fa6d0018b7f0', 'https://benedict.nibgate.xyz/writing/the-man-who-prepared-for-the-end-of-the-internet')).toBe(expected)
    expect(isCanonicalContentHash(expected)).toBe(true)
    expect(isCanonicalContentHash('0xec845c35ebc2490bb8a5fa6d0018b7f0')).toBe(false)
    expect(canonicalContentHash({
      id: 'ec845c35-ebc2-490b-b8a5-fa6d0018b7f0',
      url: 'https://benedict.nibgate.xyz/writing/the-man-who-prepared-for-the-end-of-the-internet'
    })).toBe(expected)
    expect(contentRatingHash({ id: 'ec845c35-ebc2-490b-b8a5-fa6d0018b7f0', url: 'https://benedict.nibgate.xyz/writing/the-man-who-prepared-for-the-end-of-the-internet' })).toBe(expected)
    expect(contentRatingHash({}, { contentId: '0xec845c35ebc2490bb8a5fa6d0018b7f0' })).toBe('0xec845c35ebc2490bb8a5fa6d0018b7f0')
  })
})
