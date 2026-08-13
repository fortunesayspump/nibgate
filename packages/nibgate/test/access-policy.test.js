import { describe, it, expect } from 'vitest'
import { normalizeWalletAddress, normalizeWhitelist, isPaidValue, isWhitelisted, inWhitelist, effectivePrice, accessDecision, canAccess, hasPaidReceipt, paidCutoffWallets } from '../src/server/access-policy.js'

const W = '0x1234567890abcdef1234567890abcdef12345678'
const W2 = '0xabcdef1234567890abcdef1234567890abcdef12'
const OTHER = '0xffeeddccbbaa9900112233445566778899abcdef'

describe('normalizeWalletAddress / normalizeWhitelist', () => {
  it('lowercases and validates addresses', () => {
    expect(normalizeWalletAddress(' 0xABC ')).toBe(null)
    expect(normalizeWalletAddress(W.toUpperCase())).toBe(W)
    expect(normalizeWalletAddress('junk')).toBe(null)
  })

  it('dedupes and drops invalid entries from whitelists', () => {
    expect(normalizeWhitelist([W, W.toUpperCase(), 'junk', '', W2])).toEqual([W, W2])
  })
})

describe('isPaidValue / effectivePrice', () => {
  it('treats 0 / empty / null as free', () => {
    expect(isPaidValue('0')).toBe(false)
    expect(isPaidValue('')).toBe(false)
    expect(isPaidValue(null)).toBe(false)
    expect(isPaidValue('0.01')).toBe(true)
  })

  it('prefers whitelistPrice for members, public price otherwise', () => {
    const policy = { price: '1', whitelist: [W], whitelistPrice: '0', publicAccess: true }
    expect(effectivePrice(policy, W)).toBe(0)
    expect(effectivePrice(policy, OTHER)).toBe(1)
  })
})

describe('accessDecision (membership)', () => {
  it('invite-only refuses non-members and admits members', () => {
    const policy = { price: '0', whitelist: [W], whitelistPrice: null, publicAccess: false }
    expect(accessDecision(policy, W).ok).toBe(true)
    expect(accessDecision(policy, OTHER).ok).toBe(false)
    expect(accessDecision(policy, OTHER).reason).toBe('invite-only')
  })

  it('open post admits everyone', () => {
    const policy = { price: '1', whitelist: [], whitelistPrice: null, publicAccess: true }
    expect(accessDecision(policy, OTHER).ok).toBe(true)
  })
})

describe('canAccess (§4 rule)', () => {
  const paid = { price: '1', whitelist: [], whitelistPrice: null, publicAccess: true }

  it('anonymous on a paid post -> 402 challenge', () => {
    const r = canAccess(paid, { wallet: null })
    expect(r).toMatchObject({ allowed: false, reason: 'payment-required', challenge: true })
  })

  it('banned is a hard deny that cannot re-purchase', () => {
    const r = canAccess(paid, { wallet: OTHER, entitlement: { status: 'banned' } })
    expect(r).toMatchObject({ allowed: false, reason: 'banned', challenge: false })
  })

  it('revoked denies and does not prompt re-purchase automatically', () => {
    const r = canAccess(paid, { wallet: OTHER, entitlement: { status: 'revoked' } })
    expect(r).toMatchObject({ allowed: false, reason: 'revoked', challenge: false })
  })

  it('active paid entitlement backed by a receipt -> lifetime grant', () => {
    const r = canAccess(paid, { wallet: OTHER, entitlement: { status: 'active' }, hasPaidReceipt: true })
    expect(r).toMatchObject({ allowed: true, grant: 'paid', challenge: false })
  })

  it('active FREE entitlement on a paid post -> free grant (legacy row 5)', () => {
    const r = canAccess(paid, { wallet: OTHER, entitlement: { status: 'active' }, hasPaidReceipt: false })
    expect(r).toMatchObject({ allowed: true, grant: 'free', challenge: false })
  })

  it('valid proof fast-path grants without entitlement', () => {
    const r = canAccess(paid, { wallet: OTHER, entitlement: null, proofValid: true })
    expect(r).toMatchObject({ allowed: true, grant: 'proof', challenge: false })
  })

  it('whitelist free tier (whitelistPrice=0 member) grants free on a paid post', () => {
    const policy = { price: '1', whitelist: [W], whitelistPrice: '0', publicAccess: true }
    const r = canAccess(policy, { wallet: W, entitlement: null })
    expect(r).toMatchObject({ allowed: true, grant: 'free', challenge: false })
  })

  it('invite-only non-member is refused with challenge:false', () => {
    const policy = { price: '1', whitelist: [W], whitelistPrice: '0', publicAccess: false }
    const r = canAccess(policy, { wallet: OTHER, entitlement: null })
    expect(r).toMatchObject({ allowed: false, reason: 'invite-only', challenge: false })
  })

  it('fully-public free post is ungated', () => {
    const policy = { price: '0', whitelist: [], whitelistPrice: null, publicAccess: true }
    const r = canAccess(policy, { wallet: null })
    expect(r).toMatchObject({ allowed: true, grant: 'free', challenge: false })
  })
})

describe('hasPaidReceipt / paidCutoffWallets (gap #11)', () => {
  it('only amount > 0 receipts count as paid', () => {
    expect(hasPaidReceipt({ amount: '1' })).toBe(true)
    expect(hasPaidReceipt({ amount: '0' })).toBe(false)
    expect(hasPaidReceipt({ amount: null })).toBe(false)
  })

  it('lists active paid non-whitelisted wallets under the NEW invite-only whitelist', () => {
    const policy = { whitelist: [W], publicAccess: false }
    const entitlements = [
      { status: 'active', wallet: W2 },
      { status: 'active', wallet: W }, // member -> not cut off
      { status: 'revoked', wallet: OTHER }, // not active -> not cut off
    ]
    const receipts = [{ payerWallet: W2, amount: '1' }]
    expect(paidCutoffWallets({ policy, entitlements, receipts })).toEqual([W2])
  })

  it('does not cut off free-granted wallets (no receipt)', () => {
    const policy = { whitelist: [W], publicAccess: false }
    const entitlements = [{ status: 'active', wallet: W2 }]
    expect(paidCutoffWallets({ policy, entitlements, receipts: [] })).toEqual([])
  })
})