// Live direct-rail end-to-end against Arc TESTNET with real USDC.
//
// The stubbed suite (direct-rail.e2e.test.js) proves protocol shape. This
// proves the money path and, more importantly, the failure we actually hit:
// USDC broadcast, ownership proof never delivered, unlock stuck.
//
// Opt in with NIBGATE_LIVE_E2E=1 so CI never spends chain latency or funds.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync as fsExistsSync } from 'node:fs'
import path from 'node:path'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import { createNibgateServer } from '../src/server/access.js'
import { preflightTransfer, transferOwnershipMessage, ARC_USDC } from '../src/server/fee-wallet.js'

const LIVE = process.env.NIBGATE_LIVE_E2E === '1'

function loadEnv() {
  // cwd is packages/nibgate; repo root is two levels up
  let file = path.resolve(process.cwd(), '..', '..', 'backend', '.env')
  if (!fsExistsSync(file)) file = path.resolve(process.cwd(), 'backend', '.env')
  if (!fsExistsSync(file)) file = path.resolve(__dirname, '..', '..', 'backend', '.env')
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const env = LIVE ? loadEnv() : {}

// Never let a misconfigured key spend real money on mainnet.
if (LIVE && env.NIBGATE_NETWORK !== 'testnet') {
  throw new Error(`Refusing to run live: NIBGATE_NETWORK=${env.NIBGATE_NETWORK}, expected testnet`)
}

const payer = LIVE ? privateKeyToAccount(env.NIBGATE_KEEPER_PRIVATE_KEY) : null
// Prefer ARC_RPC_URL: NIBGATE_PAYMENT_RPC_URL in backend/.env currently answers
// 401 unauthorized. See the note in the summary — that key needs rotating.
const rpcUrl = LIVE ? env.ARC_RPC_URL || env.NIBGATE_PAYMENT_RPC_URL : ''

const publicClient = LIVE
  ? createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) })
  : null

const usdcAbi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

function request(url, headers = {}) {
  return new Request(`http://localhost${url}`, {
    headers: new Headers({ accept: 'application/json', ...headers }),
  })
}

// Each run pays a throwaway address so repeated live runs cannot pile up in a
// real creator wallet.
function freshRecipient() {
  return privateKeyToAccount(generatePrivateKey()).address
}

async function sendUsdc(to, amount) {
  const wallet = createWalletClient({ account: payer, chain: arcTestnet, transport: http(rpcUrl) })
  const hash = await wallet.writeContract({
    address: ARC_USDC,
    abi: usdcAbi,
    functionName: 'transfer',
    args: [to, parseUnits(amount, 6)],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
  expect(receipt.status).toBe('success')
  return hash
}

async function ownerSignature(txHash, resource) {
  return payer.signMessage({ message: transferOwnershipMessage(txHash, resource) })
}

describe.skipIf(!LIVE)('direct rail LIVE (real Arc testnet USDC)', () => {
  it('recovers an unlock when the USDC landed but the ownership proof never arrived', async () => {
    const recipient = freshRecipient()
    const PRICE = '0.01'
    const resource = {
      id: 'live-post-1',
      title: 'Live E2E',
      type: 'article',
      price: PRICE,
      currency: 'USDC',
      path: '/writing/live-post-1',
      recipient,
    }
    const server = createNibgateServer({ rpcUrl, receiptWaitMs: 60000 })

    // ── Preflight: catch problems while the money is still in the wallet ──
    const pre = await preflightTransfer(resource, { payer: payer.address, amount: PRICE })
    expect(pre.ok).toBe(true)
    const payTo = pre.payTo || recipient

    // ── The payer broadcasts real USDC ──
    const before = await publicClient.readContract({
      address: ARC_USDC, abi: usdcAbi, functionName: 'balanceOf', args: [payer.address],
    })
    const txHash = await sendUsdc(payTo, PRICE)
    const after = await publicClient.readContract({
      address: ARC_USDC, abi: usdcAbi, functionName: 'balanceOf', args: [payer.address],
    })
    // Prove the USDC really left the payer, so "unlocked" cannot be a no-op.
    expect(before - after).toBeGreaterThanOrEqual(parseUnits(PRICE, 6))

    // ── THE INCIDENT: retry without the ownership proof ──
    // The money is gone; the unlock must NOT be granted. If this ever returns
    // 200, an attacker could unlock with any confirmed tx they observed.
    const orphan = await server.accessResponse(
      request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash }),
      resource,
    )
    expect(orphan.status).toBe(402)

    // ── Recovery: re-sign the SAME txHash, no second transfer ──
    const sig = await ownerSignature(txHash, resource)
    const recovered = await server.accessResponse(
      request('/api/nibgate/access?rail=transfer', {
        'x-nibgate-transfer-tx': txHash,
        'x-nibgate-tx-owner': sig,
      }),
      resource,
    )
    expect(recovered.status).toBe(200)
    const body = await recovered.json()
    expect(body.ok).toBe(true)
    expect(body.payment.txHash).toBe(txHash)
    expect(body.unlockProof).toBeTruthy()

    // The payer must not have been charged a second time by the recovery.
    const afterRecovery = await publicClient.readContract({
      address: ARC_USDC, abi: usdcAbi, functionName: 'balanceOf', args: [payer.address],
    })
    expect(afterRecovery).toBe(after)

    // ── Replay the unlock proof: still unlocked, still no charge ──
    const replay = await server.accessResponse(
      request('/api/nibgate/access?rail=transfer', { 'x-nibgate-payment-proof': body.unlockProof }),
      resource,
    )
    expect(replay.status).toBe(200)
    expect((await replay.json()).ok).toBe(true)
  })

  it('preflight refuses a payer who cannot cover the price', async () => {
    const PRICE = '0.01'
    const resource = {
      id: 'live-unfunded', title: 'Unfunded', type: 'article', price: PRICE,
      currency: 'USDC', path: '/writing/live-unfunded', recipient: freshRecipient(),
    }
    const broke = privateKeyToAccount(generatePrivateKey()).address
    const pre = await preflightTransfer(resource, { payer: broke, amount: PRICE })
    expect(pre.ok).toBe(false)
    expect(pre.reason).toBe('preflight-insufficient-balance')
  })

  it('preflight rejects a malformed payer address before any broadcast', async () => {
    const resource = {
      id: 'live-badaddr', title: 'Bad', type: 'article', price: '0.01',
      currency: 'USDC', path: '/writing/live-badaddr', recipient: freshRecipient(),
    }
    const pre = await preflightTransfer(resource, { payer: '0xnope', amount: '0.01' })
    expect(pre.ok).toBe(false)
    expect(pre.reason).toBe('preflight-invalid-payer')
  })
})