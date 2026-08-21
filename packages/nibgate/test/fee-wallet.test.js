import { describe, it, expect } from 'vitest'
import { feePolicy, protocolFeeFor, feeWalletAddressFor, ensureFeeWalletDeployed, createPredictedWalletReader, resolvePayTo, createTransferVerifier, runHostedTransferRequirement, runHostedPayRequirement, ARC_USDC, ARC_TESTNET_CHAIN, DEFAULT_FEE_BPS, DEFAULT_MAX_FEE_BPS, DEFAULT_TREASURY, FEE_WALLET_FACTORY_ABI, sweepFeeWallet, withdrawGatewayBalanceFor, distributeFeeWallet } from '../src/server/fee-wallet.js'

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

describe('protocolFeeFor', () => {
  const factory = '0x1111111111111111111111111111111111111111'

  it('charges 1% of the amount on hosted content with a factory', () => {
    expect(protocolFeeFor(1, { hosted: true, feeWalletFactory: factory })).toBe(0.01)
  })

  it('charges nothing when self-hosted', () => {
    expect(protocolFeeFor(1, { hosted: false, feeWalletFactory: factory })).toBe(0)
  })

  it('charges nothing when no fee wallet factory is configured', () => {
    expect(protocolFeeFor(1, { hosted: true })).toBe(0)
  })

  it('charges nothing for free content', () => {
    expect(protocolFeeFor(0, { hosted: true, feeWalletFactory: factory })).toBe(0)
  })

  it('honors a custom feeBps policy', () => {
    expect(protocolFeeFor(2.5, { hosted: true, feeWalletFactory: factory, feeBps: 300 })).toBe(0.075)
  })
})

describe('resolvePayTo', () => {
  const creator = '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12'

  it('returns the creator EOA when self-hosted', async () => {
    expect(await resolvePayTo(creator, { hosted: false })).toBe(creator)
  })

  it('falls back to the creator when no fee wallet factory is configured', async () => {
    expect(await resolvePayTo(creator, { hosted: true })).toBe(creator)
  })

  it('resolves to the fee wallet for hosted content when configured', async () => {
    const feeWallet = '0x7C6B2e668016738e1be2463d589085b46C0Efd83'
    const predictedWallet = async () => feeWallet
    expect(await resolvePayTo(creator, {
      hosted: true,
      feeWalletFactory: '0x1111111111111111111111111111111111111111',
      predictedWallet,
    })).toBe(feeWallet)
  })
})

describe('ensureFeeWalletDeployed', () => {
  const wallet = '0x7C6B2e668016738e1be2463d589085b46C0Efd83'
  const creator = '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12'
  const factory = '0x1111111111111111111111111111111111111111'

  it('returns exists when the wallet already has code', async () => {
    const publicClient = { getCode: async () => '0x6000' }
    const result = await ensureFeeWalletDeployed(wallet, { publicClient })
    expect(result.status).toBe('exists')
  })

  it('deploys via the factory when the wallet has no code', async () => {
    const publicClient = { getCode: async () => null, waitForTransactionReceipt: async () => ({ status: 'success' }) }
    const walletClient = { writeContract: async ({ functionName, args, account }) => {
      expect(functionName).toBe('deployIfNeeded')
      expect(args[0]).toBe(creator)
      expect(account.address.startsWith('0x')).toBe(true)
      return '0xdeploy'
    } }
    const result = await ensureFeeWalletDeployed(wallet, {
      publicClient, walletClient, feeWalletFactory: factory, creator,
      keeperKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    })
    expect(result.status).toBe('deployed')
  })

  it('requires a factory to deploy', async () => {
    const publicClient = { getCode: async () => null }
    await expect(ensureFeeWalletDeployed(wallet, { publicClient })).rejects.toThrow('feeWalletFactory')
  })

  it('requires a creator to deploy', async () => {
    const publicClient = { getCode: async () => null }
    await expect(ensureFeeWalletDeployed(wallet, { publicClient, feeWalletFactory: factory })).rejects.toThrow('creator')
  })
})

describe('transient RPC retry (rate limits)', () => {
  const wallet = '0x7C6B2e668016738e1be2463d589085b46C0Efd83'
  const creator = '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12'
  const factory = '0x1111111111111111111111111111111111111111'
  const gatewayMinter = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B'
  const rpcUrl = 'http://localhost:8545'
  const keeperKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

  it('retries deployIfNeeded when the RPC rate-limits, then succeeds', async () => {
    let calls = 0
    const publicClient = {
      getCode: async () => null,
      waitForTransactionReceipt: async () => ({ status: 'success' }),
    }
    const walletClient = {
      writeContract: async () => {
        calls++
        if (calls === 1) throw Object.assign(new Error('rate limit exceeded'), { shortMessage: 'Request exceeds defined limit' })
        return '0xdeploy'
      },
    }
    const result = await ensureFeeWalletDeployed(wallet, { publicClient, walletClient, feeWalletFactory: factory, creator, keeperKey })
    expect(result.status).toBe('deployed')
    expect(calls).toBeGreaterThan(1)
  })

  it('surfaces a non-transient error immediately without retrying', async () => {
    let calls = 0
    const publicClient = { getCode: async () => null }
    const walletClient = {
      writeContract: async () => {
        calls++
        throw Object.assign(new Error('deployIfNeeded reverted'), { shortMessage: 'execution reverted' })
      },
    }
    await expect(ensureFeeWalletDeployed(wallet, { publicClient, walletClient, feeWalletFactory: factory, creator, keeperKey })).rejects.toThrow('deployIfNeeded reverted')
    expect(calls).toBe(1)
  })

  it('retries gatewayMint on rate limit and reports the successful mint', async () => {
    let mintCalls = 0
    const gatewayApi = 'http://localhost:9999/v1'
    const publicClient = { getCode: async () => '0x6000', waitForTransactionReceipt: async () => ({ status: 'success' }) }
    const walletClient = {
      writeContract: async ({ functionName }) => {
        if (functionName === 'gatewayMint') {
          mintCalls++
          if (mintCalls === 1) throw new Error('Request exceeds defined limit')
          return '0x10ab'
        }
        return '0x01'
      },
    }
    global.fetch = async (url) => {
      const u = String(url)
      if (u.includes('/v1/balances')) {
        return { status: 200, ok: true, json: async () => ({ balances: [{ domain: 26, depositor: wallet, balance: '1.000000', pendingBatch: '0.000000' }] }) }
      }
      if (u.includes('/v1/transfer')) {
        return { status: 200, ok: true, json: async () => ({ attestation: '0xaaa', operatorSignature: '0xbbb' }) }
      }
      return { status: 404, json: async () => ({}) }
    }
    try {
      const result = await withdrawGatewayBalanceFor(wallet, {
        creator, feeWalletFactory: factory, keeperKey, rpcUrl, gatewayApi, gatewayMinter,
        publicClient, walletClient,
      })
      expect(result.minted).toBe(true)
      expect(mintCalls).toBeGreaterThan(1)
    } finally {
      delete global.fetch
    }
  })

  it('sweep idempotency: a distributed wallet reports skipped on the second sweep', async () => {
    const gatewayApi = 'http://localhost:9999/v1'
    const publicClient = {
      getCode: async () => '0x6000',
      waitForTransactionReceipt: async () => ({ status: 'success' }),
    }
    const walletClient = { writeContract: async ({ functionName }) => {
      if (functionName === 'gatewayMint') return '0x10ab'
      return '0x01'
    } }
    global.fetch = async (url) => {
      const u = String(url)
      if (u.includes('/v1/balances')) {
        return { status: 200, ok: true, json: async () => ({ balances: [{ domain: 26, depositor: wallet, balance: '1.000000', pendingBatch: '0.000000' }] }) }
      }
      if (u.includes('/v1/transfer')) {
        return { status: 200, ok: true, json: async () => ({ attestation: '0xaaa', operatorSignature: '0xbbb' }) }
      }
      return { status: 404, json: async () => ({}) }
    }
    try {
      const first = await sweepFeeWallet(wallet, { creator, feeWalletFactory: factory, keeperKey, rpcUrl, gatewayApi, gatewayMinter, publicClient, walletClient })
      expect(first.gateway.skipped || first.gateway.minted).toBeTruthy()
      const second = await sweepFeeWallet(wallet, { creator, feeWalletFactory: factory, keeperKey, rpcUrl, gatewayApi, gatewayMinter, publicClient, walletClient })
      expect(second.distributed.skipped).toBe(true)
    } finally {
      delete global.fetch
    }
  })
})

describe('feeWalletAddressFor', () => {
  it('returns null without a configured factory', async () => {
    expect(await feeWalletAddressFor('0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12')).toBeNull()
  })

  it('reads the factory predictedWallet view (single source of truth)', async () => {
    const feeWallet = '0x7C6B2e668016738e1be2463d589085b46C0Efd83'
    const predictedWallet = async () => feeWallet
    const a = await feeWalletAddressFor('0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12', {
      feeWalletFactory: '0x1111111111111111111111111111111111111111',
      predictedWallet,
    })
    const b = await feeWalletAddressFor('0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12', {
      feeWalletFactory: '0x1111111111111111111111111111111111111111',
      predictedWallet,
    })
    expect(a).toBe(feeWallet)
    expect(b).toBe(feeWallet)
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('falls back to null when the factory read fails', async () => {
    const predictedWallet = async () => { throw new Error('rpc down') }
    expect(await feeWalletAddressFor('0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12', {
      feeWalletFactory: '0x1111111111111111111111111111111111111111',
      predictedWallet,
    })).toBeNull()
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
    const verifier = createTransferVerifier({ rpcUrl: 'https://rpc.invalid', recipient: creator, receiptWaitMs: 800 })
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