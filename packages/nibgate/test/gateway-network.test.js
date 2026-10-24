import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  activePaymentNetwork,
  defaultBuyerChain,
  defaultFacilitatorUrl,
  isMainnetNetwork,
  normalizeGatewayNetwork
} from '../src/server/gateway.js'

afterEach(() => vi.unstubAllEnvs())

describe('Gateway network defaults', () => {
  it('normalizes Arc aliases without confusing testnet for mainnet', () => {
    expect(normalizeGatewayNetwork('mainnet')).toBe('eip155:5042')
    expect(normalizeGatewayNetwork('arc')).toBe('eip155:5042')
    expect(normalizeGatewayNetwork('arc-testnet')).toBe('eip155:5042002')
    expect(normalizeGatewayNetwork('eip155:5042002')).toBe('eip155:5042002')
    expect(isMainnetNetwork('eip155:15042')).toBe(false)
  })

  it('keeps facilitator and buyer defaults on the same configured network', () => {
    vi.stubEnv('NIBGATE_PAYMENT_NETWORK', '')
    vi.stubEnv('NIBGATE_NETWORK', 'mainnet')
    expect(activePaymentNetwork()).toBe('mainnet')
    expect(normalizeGatewayNetwork()).toBe('eip155:5042')
    expect(defaultFacilitatorUrl()).toBe('https://gateway-api.circle.com')
    expect(defaultBuyerChain()).toBe('arc')
  })

  it('defaults every Gateway component to testnet when unset', () => {
    vi.stubEnv('NIBGATE_PAYMENT_NETWORK', '')
    vi.stubEnv('NIBGATE_NETWORK', '')
    expect(normalizeGatewayNetwork()).toBe('eip155:5042002')
    expect(defaultFacilitatorUrl()).toBe('https://gateway-api-testnet.circle.com')
    expect(defaultBuyerChain()).toBe('arcTestnet')
  })
})
