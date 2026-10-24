import { describe, it, expect, vi, beforeEach } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
const chainMock = vi.hoisted(() => ({
  readContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  sendTransaction: vi.fn(),
  getGasPrice: vi.fn(),
  estimateGas: vi.fn(),
  getBalance: vi.fn(),
}))
vi.mock('viem', async (importOriginal) => ({
  ...await importOriginal(),
  createPublicClient: () => ({
    readContract: chainMock.readContract,
    waitForTransactionReceipt: chainMock.waitForTransactionReceipt,
    getGasPrice: chainMock.getGasPrice,
    estimateGas: chainMock.estimateGas,
    getBalance: chainMock.getBalance,
  }),
  createWalletClient: () => ({ sendTransaction: chainMock.sendTransaction }),
  http: () => ({}),
}))
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
  buildHoldingRefund,
  submitHoldingRefund,
  submitHoldingRelease,
  HOLDING_FACTORY_ABI,
} from '../src/server/holding.js'

const TEST_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const TEST_ADDR = privateKeyToAccount(TEST_KEY).address.toLowerCase()
const FACTORY = '0x0000000000000000000000000000000000000001'
const BOX = '0x0000000000000000000000000000000000000002'
const TX = `0x${'ab'.repeat(32)}`

beforeEach(() => {
  vi.clearAllMocks()
  chainMock.readContract.mockResolvedValue(BOX)
  chainMock.sendTransaction.mockResolvedValue(TX)
  chainMock.getGasPrice.mockResolvedValue(25_000_000_000n)
  chainMock.estimateGas.mockResolvedValue(1_000_000n)
  chainMock.getBalance.mockResolvedValue(30_000_000_000_000_000n)
})

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

  it('rejects signed but non-canonical or incomplete claim messages', async () => {
    const expires = Date.now() + 60000
    for (const message of [
      `domain:example.com\nwallet:${TEST_ADDR}\nexpires:${expires}`,
      `Nibgate tip claim\ndomain:example.com\nwallet:${TEST_ADDR}`,
      `Nibgate tip claim\ndomain:example.com\nwallet:${TEST_ADDR}\nexpires:0`,
      `Anything goes\ndomain:example.com\nwallet:${TEST_ADDR}\nexpires:${expires}`,
    ]) {
      const signature = await signMessage(message)
      const out = await verifyClaimToken({ message, signature, domain: 'example.com', wallet: TEST_ADDR })
      expect(out.valid).toBe(false)
    }
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

describe('keeper settlement receipt validation', () => {
  function eventLog(eventName, args) {
    const topics = encodeEventTopics({ abi: HOLDING_FACTORY_ABI, eventName, args })
    const data = eventName === 'Refunded'
      ? encodeAbiParameters([{ type: 'uint256' }], [args.amount])
      : encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [args.amount, args.protocolFee])
    return { address: BOX, topics, data }
  }

  it('confirms an exact refund event and persists the hash before waiting', async () => {
    const call = buildHoldingRefund({ domain: 'example.com', payer: TEST_ADDR, amountUsdc: 2, factoryAddress: FACTORY })
    const order = []
    chainMock.waitForTransactionReceipt.mockImplementation(async () => {
      order.push('wait')
      return { status: 'success', logs: [eventLog('Refunded', { domainHash: domainHashFor('example.com'), payer: TEST_ADDR, amount: 2_000_000n })] }
    })
    await expect(submitHoldingRefund(call, {
      privateKey: TEST_KEY, rpcUrl: 'http://fixture.invalid', chainId: 5042002,
      onSubmitted: async () => { order.push('persist') },
    })).resolves.toBe(TX)
    expect(order).toEqual(['persist', 'wait'])
    expect(chainMock.sendTransaction).toHaveBeenCalledWith(expect.objectContaining({
      gas: 1_000_000n,
      gasPrice: 25_000_000_000n,
    }))
  })

  it('fails clearly before submission when the keeper cannot cover bounded gas', async () => {
    const call = buildHoldingRefund({ domain: 'example.com', payer: TEST_ADDR, amountUsdc: 2, factoryAddress: FACTORY })
    chainMock.getBalance.mockResolvedValue(24_999_999_999_999_999n)
    await expect(submitHoldingRefund(call, { privateKey: TEST_KEY, rpcUrl: 'http://fixture.invalid', chainId: 5042002 }))
      .rejects.toMatchObject({ code: 'keeper-gas-insufficient' })
    expect(chainMock.sendTransaction).not.toHaveBeenCalled()
  })

  it('quarantines a refund when the event amount does not match', async () => {
    const call = buildHoldingRefund({ domain: 'example.com', payer: TEST_ADDR, amountUsdc: 2, factoryAddress: FACTORY })
    chainMock.waitForTransactionReceipt.mockResolvedValue({
      status: 'success',
      logs: [eventLog('Refunded', { domainHash: domainHashFor('example.com'), payer: TEST_ADDR, amount: 1_000_000n })],
    })
    await expect(submitHoldingRefund(call, { privateKey: TEST_KEY, rpcUrl: 'http://fixture.invalid', chainId: 5042002 }))
      .rejects.toMatchObject({ code: 'refund-reconciliation-required', refundTx: TX, requestedUnits: '2000000', actualUnits: '1000000' })
  })

  it('confirms that a release event accounts for the complete ledger snapshot', async () => {
    const call = buildHoldingRelease({ domain: 'example.com', creator: TEST_ADDR, factoryAddress: FACTORY })
    chainMock.waitForTransactionReceipt.mockResolvedValue({
      status: 'success',
      logs: [eventLog('Released', { domainHash: domainHashFor('example.com'), creator: TEST_ADDR, amount: 1_900_000n, protocolFee: 100_000n })],
    })
    await expect(submitHoldingRelease(call, { privateKey: TEST_KEY, rpcUrl: 'http://fixture.invalid', chainId: 5042002, expectedAmountUnits: 2_000_000n }))
      .resolves.toBe(TX)
    await expect(submitHoldingRelease(call, { privateKey: TEST_KEY, rpcUrl: 'http://fixture.invalid', chainId: 5042002, expectedAmountUnits: 3_000_000n }))
      .rejects.toMatchObject({ code: 'release-reconciliation-required', releaseTx: TX, expectedUnits: '3000000', actualUnits: '2000000' })
  })

  it('quarantines a release whose fee differs despite the same gross amount', async () => {
    const call = buildHoldingRelease({ domain: 'example.com', creator: TEST_ADDR, factoryAddress: FACTORY })
    chainMock.waitForTransactionReceipt.mockResolvedValue({
      status: 'success',
      logs: [eventLog('Released', { domainHash: domainHashFor('example.com'), creator: TEST_ADDR, amount: 1_900_000n, protocolFee: 100_000n })],
    })
    await expect(submitHoldingRelease(call, {
      privateKey: TEST_KEY, rpcUrl: 'http://fixture.invalid', chainId: 5042002,
      expectedAmountUnits: 2_000_000n, expectedProtocolFeeUnits: 50_000n,
    })).rejects.toMatchObject({ code: 'release-reconciliation-required', releaseTx: TX, actualUnits: '100000' })
  })
})
