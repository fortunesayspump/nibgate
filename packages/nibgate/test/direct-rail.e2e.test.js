import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { createNibgateServer } from '../src/server/access.js'
import { ARC_USDC } from '../src/server/fee-wallet.js'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const SELLER = '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12'
const BUYER = '0x1234567890abcdef1234567890abcdef12345678'

const RESOURCE = { id: 'post-1', title: 'Post', price: '1.5', currency: 'USDC', recipient: SELLER, paymentRail: 'transfer' }

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

function startRpcStub({ payer = BUYER, to = SELLER, amountUsdc = 1.5 }) {
  const txHash = '0x' + 'ab'.repeat(32)
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
    const paidRes = await server.accessResponse(request(`/api/nibgate/access?rail=transfer`, { 'x-nibgate-transfer-tx': txHash }), RESOURCE)
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
})