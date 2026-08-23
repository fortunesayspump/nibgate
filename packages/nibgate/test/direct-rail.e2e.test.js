import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { privateKeyToAccount } from 'viem/accounts'
import { createNibgateServer } from '../src/server/access.js'
import { runHostedTransferRequirement, transferOwnershipMessage, ARC_USDC } from '../src/server/fee-wallet.js'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const SELLER = '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12'
const buyerAccount = privateKeyToAccount('0x' + '11'.repeat(32))
const otherAccount = privateKeyToAccount('0x' + '22'.repeat(32))
const BUYER = buyerAccount.address

const RESOURCE = { id: 'post-1', title: 'Post', price: '1.5', currency: 'USDC', recipient: SELLER, paymentRail: 'transfer' }

// Server-side messages are built from the NORMALIZED resource (path defaults
// to '/'), so proofs must be signed against the same shape.
const ownerHeaderFor = async (account, txHash, resource = RESOURCE) => ({
  'x-nibgate-tx-owner': await account.signMessage({ message: transferOwnershipMessage(txHash, { ...resource, path: resource.path || '/' }) }),
})

const servers = []
afterEach(async () => {
  while (servers.length) {
    const s = servers.pop()
    await new Promise((resolve) => s.close(resolve))
  }
})

function pad32(hexAddress) {
  return '0x' + hexAddress.slice(2).toLowerCase().padStart(64, '0')
}

function startRpcStub({ payer = BUYER, to = SELLER, amountUsdc = 1.5, chainIdHex = '0x4cef52', headBlockRef = { hex: '0x1' } }) {  const txHash = '0x' + 'ab'.repeat(32)
  const amountWei = BigInt(Math.round(amountUsdc * 1e6))
  const amountHex = '0x' + amountWei.toString(16).padStart(64, '0')
  const receipt = {
    transactionHash: txHash,
    transactionIndex: '0x0',
    blockHash: '0x' + 'cd'.repeat(32),
    blockNumber: '0x1',
    from: payer.toLowerCase(),
    to: ARC_USDC.toLowerCase(),
    cumulativeGasUsed: '0x5208',
    gasUsed: '0x5208',
    contractAddress: null,
    logs: [
      {
        address: ARC_USDC.toLowerCase(),
        topics: [TRANSFER_TOPIC, pad32(payer), pad32(to)],
        data: amountHex,
        blockNumber: '0x1',
        transactionHash: txHash,
        transactionIndex: '0x0',
        blockHash: '0x' + 'cd'.repeat(32),
        logIndex: '0x0',
        removed: false,
      },
    ],
    logsBloom: '0x00',
    status: '0x1',
    effectiveGasPrice: '0x3b9aca00',
    type: '0x0',
  }

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      let params = []
      let id = 1
      let method = ''
      try {
        const json = JSON.parse(body || '{}')
        params = json.params || []
        id = json.id
        method = json.method || ''
      } catch {}
      let result = null
      if (method === 'eth_getTransactionReceipt') {
        if (params[0] === txHash) result = receipt
      }
      if (method === 'eth_chainId') result = chainIdHex
      if (method === 'eth_blockNumber') result = headBlockRef.hex
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }))
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      servers.push(server)
      resolve({ txHash, rpcUrl: `http://127.0.0.1:${port}` })
    })
  })
}

function request(url, headers = {}) {
  return new Request(`http://localhost${url}`, { headers: new Headers({ accept: 'application/json', ...headers }) })
}

describe('direct rail end-to-end (challenge → verify → unlock → replay)', () => {
  it('serves a transfer challenge, verifies a broadcast USDC transfer on-chain, and mints a replayable proof', async () => {
    const { txHash, rpcUrl } = await startRpcStub({})
    const server = createNibgateServer({ rpcUrl })

    // 1. No payment presented -> 402 transfer challenge with the seller as payTo.
    const challengeRes = await server.accessResponse(request('/api/nibgate/access?rail=transfer'), RESOURCE)
    expect(challengeRes.status).toBe(402)
    const challenge = await challengeRes.json()
    expect(challenge.paymentRail).toBe('transfer')
    expect(challenge.accepts[0].payTo.toLowerCase()).toBe(SELLER.toLowerCase())
    expect(challenge.accepts[0].amount).toBe('1.5')

    // 2. Buyer broadcasts the transfer; the server verifies it on-chain via the stub RPC.
    // The request must also carry an ownership proof signed by the PAYING wallet.
    const paidRes = await server.accessResponse(request(`/api/nibgate/access?rail=transfer`, { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash)) }), RESOURCE)
    expect(paidRes.status).toBe(200)
    const paid = await paidRes.json()
    expect(paid.ok).toBe(true)
    expect(paid.payment.paymentProvider).toBe('direct-transfer')
    expect(paid.payment.txHash).toBe(txHash)
    expect(paid.payment.payer).toBe(BUYER.toLowerCase())
    expect(paid.unlockProof).toBeTruthy()

    // 3. Replay the proof -> unlocked, no payment needed.
    const replayRes = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-payment-proof': paid.unlockProof }), RESOURCE)
    expect(replayRes.status).toBe(200)
    expect((await replayRes.json()).ok).toBe(true)
  })

  it('rejects a transfer that did not pay the seller (wrong recipient)', async () => {
    const { txHash, rpcUrl } = await startRpcStub({ to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    const server = createNibgateServer({ rpcUrl })

    const paidRes = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash }), RESOURCE)
    expect(paidRes.status).toBe(402)
    expect((await paidRes.json()).error).toContain('verification failed')
  })

  it('rejects a transfer below the price', async () => {
    const { txHash, rpcUrl } = await startRpcStub({ amountUsdc: 0.5 })
    const server = createNibgateServer({ rpcUrl })

    const paidRes = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash }), RESOURCE)
    expect(paidRes.status).toBe(402)
  })

  it('rejects when the tx has not confirmed yet (null receipt)', async () => {
    const { rpcUrl } = await startRpcStub({})
    const server = createNibgateServer({ rpcUrl, receiptWaitMs: 500 })

    const paidRes = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': '0x' + 'ff'.repeat(32) }), RESOURCE)
    expect(paidRes.status).toBe(402)
  })

  it('surfaces overpayment (double-pay) on the payment object', async () => {
    const { txHash, rpcUrl } = await startRpcStub({ amountUsdc: 2.0 }) // sent 2.0 for a 1.5 post
    const server = createNibgateServer({ rpcUrl, receiptWaitMs: 400 })
    const paid = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash)) }), RESOURCE)
    expect(paid.status).toBe(200)
    const payment = (await paid.json()).payment
    expect(payment.amountReceived).toBe(2.0)
    expect(payment.overpay).toBe(0.5)
  })

  it('waits for chain-aware confirmation depth before crediting (mainnet default)', async () => {
    // Ethereum mainnet (chainId 1): receipt at block 1, chain head at block 3.
    // Default depth on mainnet is 12 confs, so verification must NOT succeed
    // until the stub head reaches block >= receipt + depth - 1.
    const head = { n: 1n }
    const { txHash, rpcUrl } = await startRpcStub({ chainIdHex: '0x1', headBlockRef: { get hex() { return '0x' + head.n.toString(16) } } })
    const server = createNibgateServer({ rpcUrl, receiptWaitMs: 400 })

    // Head too shallow -> verifier times out without crediting.
    const early = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash }), RESOURCE)
    expect(early.status).toBe(402)

    // Deepen the chain to satisfy the mainnet default; now it credits.
    head.n = 20n
    const paidRes = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash)) }), RESOURCE)
    expect(paidRes.status).toBe(200)
    expect((await paidRes.json()).payment.txHash).toBe(txHash)
  })

  describe('claim registry (cross-site single-use)', () => {
    it('rejects a txHash already claimed by different content, allows same content (idempotent)', async () => {
      const { txHash, rpcUrl } = await startRpcStub({})
      const claims = new Map()
      let unreachableMode = false
      const registryServer = http.createServer((req, res) => {
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          if (unreachableMode) { res.destroy(); return }
          const { txHash: h, contentId } = JSON.parse(body || '{}')
          if (!claims.has(h)) {
            claims.set(h, contentId)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          } else if (claims.get(h) === contentId) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, firstClaim: false }))
          } else {
            res.writeHead(409, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, reason: 'txhash-claimed-elsewhere' }))
          }
        })
      })
      await new Promise((r) => registryServer.listen(0, '127.0.0.1', r))
      const registryUrl = `http://127.0.0.1:${registryServer.address().port}`

      // Site A claims the hash for post-1 -> unlock granted.
      const serverA = createNibgateServer({ rpcUrl, receiptWaitMs: 400, claimRegistryUrl: registryUrl })
      const paidA = await serverA.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash)) }), RESOURCE)
      expect(paidA.status).toBe(200)

      // Replay the SAME hash against a DIFFERENT resource id on "site B" ->
      // ownership proof passes (attacker controls nothing here; same payer
      // signs for their other site), but the registry rejects the reuse.
      const RESOURCE_B = { ...RESOURCE, id: 'site-b-post-9' }
      const sigB = await ownerHeaderFor(buyerAccount, txHash, RESOURCE_B)
      const serverB = createNibgateServer({ rpcUrl, receiptWaitMs: 400, claimRegistryUrl: registryUrl })
      const rejected = await serverB.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...sigB }), RESOURCE_B)
      expect(rejected.status).toBe(402)
      expect((await rejected.json()).reason).toBe('txhash-claimed-elsewhere')

      // Same resource again -> idempotent unlock, no double charge.
      const again = await serverA.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash)) }), RESOURCE)
      expect(again.status).toBe(200)

      // Registry DOWN must fail CLOSED (no unlock without global uniqueness).
      unreachableMode = true
      const RESOURCE_C = { ...RESOURCE, id: 'post-c' }
      const downRes = await createNibgateServer({ rpcUrl, receiptWaitMs: 400, claimRegistryUrl: registryUrl })
        .accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash, RESOURCE_C)) }), RESOURCE_C)
      expect(downRes.status).toBe(503)
      expect((await downRes.json()).reason).toBe('claim-registry-unavailable')

      registryServer.close()
    })

    it('without a registry configured, per-resource semantics apply (no cross-site check)', async () => {
      const { txHash, rpcUrl } = await startRpcStub({})
      const server = createNibgateServer({ rpcUrl, receiptWaitMs: 400 })
      const paid = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash)) }), RESOURCE)
      expect(paid.status).toBe(200)
    })
  })
})

describe('direct-rail ownership proof (anti-replay binding)', () => {
  it('rejects a verified transfer with NO ownership proof', async () => {
    const { txHash, rpcUrl } = await startRpcStub({})
    const server = createNibgateServer({ rpcUrl })
    const res = await server.accessResponse(request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash }), RESOURCE)
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.reason).toBe('transfer-ownership-proof-required')
  })

  it('rejects an ownership proof signed by a NON-PAYER (free-reading attack)', async () => {
    const { txHash, rpcUrl } = await startRpcStub({})
    const server = createNibgateServer({ rpcUrl })
    const res = await server.accessResponse(
      request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(otherAccount, txHash)) }),
      RESOURCE,
    )
    expect(res.status).toBe(402)
    expect((await res.json()).reason).toBe('transfer-owner-mismatch')
  })

  it('rejects a proof signed over a DIFFERENT resource (cross-post reuse)', async () => {
    const { txHash, rpcUrl } = await startRpcStub({})
    const server = createNibgateServer({ rpcUrl })
    const otherResource = { ...RESOURCE, path: '/other-post' }
    const res = await server.accessResponse(
      request('/api/nibgate/access?rail=transfer', { 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash, otherResource)) }),
      RESOURCE,
    )
    expect(res.status).toBe(402)
    expect((await res.json()).reason).toBe('transfer-owner-mismatch')
  })

  it('hosted seam: valid proof passes, missing proof is rejected', async () => {
    const { txHash, rpcUrl } = await startRpcStub({})
    const req = (headers) => ({ method: 'GET', url: '/p', headers })
    const resource = { id: 'p', price: '1.5', recipient: SELLER, title: 'p', path: '/p', paymentRail: 'transfer' }
    const opts = { rpcUrl, receiptWaitMs: 2000 }

    const missing = await runHostedTransferRequirement(req({ 'x-nibgate-transfer-tx': txHash }), resource, opts)
    expect(missing.response.status).toBe(402)
    expect((await missing.response.json()).reason).toBe('transfer-ownership-proof-required')

    const ok = await runHostedTransferRequirement(req({ 'x-nibgate-transfer-tx': txHash, ...(await ownerHeaderFor(buyerAccount, txHash, resource)) }), resource, opts)
    expect(ok.handled).toBe(false)
    expect(ok.payment.payer.toLowerCase()).toBe(BUYER.toLowerCase())
  })
})