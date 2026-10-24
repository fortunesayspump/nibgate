import { describe, expect, it, vi } from 'vitest'

import { createNibgateServer } from '../src/server/access.js'

const TX_HASH = `0x${'ab'.repeat(32)}`
const RESOURCE = {
  id: 'post-1',
  title: 'Post 1',
  path: '/posts/1',
  price: '1',
  currency: 'USDC',
  paymentRail: 'transfer',
  recipient: '0x1111111111111111111111111111111111111111'
}

function transferRequest() {
  return new Request('https://creator.example/posts/1?rail=transfer', {
    headers: { 'x-nibgate-transfer-tx': TX_HASH }
  })
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

describe('completed access event delivery', () => {
  it('waits for both event delivery attempts before returning paid access', async () => {
    const deliveries = [deferred(), deferred()]
    const emitHubEvent = vi.fn((_event, _resource, _options) => deliveries[emitHubEvent.mock.calls.length - 1].promise)
    const server = createNibgateServer({
      secret: 'test-only-secret',
      verifyTransfer: async () => true,
      txOwnerProofOptional: true,
      emitHubEvent
    })

    let settled = false
    const responsePromise = server.accessResponse(transferRequest(), RESOURCE).then((response) => {
      settled = true
      return response
    })

    await vi.waitFor(() => expect(emitHubEvent).toHaveBeenCalledTimes(2))
    expect(settled).toBe(false)

    deliveries[0].resolve({ ok: true })
    await Promise.resolve()
    expect(settled).toBe(false)

    deliveries[1].resolve({ ok: true })
    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(emitHubEvent.mock.calls.map(([event]) => event)).toEqual([
      'payment_completed',
      'unlock_completed'
    ])
    expect(emitHubEvent.mock.calls.every(([, resource]) => resource.id === RESOURCE.id)).toBe(true)
    expect(emitHubEvent.mock.calls.every(([, , eventOptions]) => eventOptions.payload.txHash === TX_HASH)).toBe(true)
  })

  it('keeps paid access available when event delivery rejects', async () => {
    const emitHubEvent = vi.fn()
      .mockRejectedValueOnce(new Error('hub unavailable'))
      .mockResolvedValueOnce({ ok: true })
    const server = createNibgateServer({
      secret: 'test-only-secret',
      verifyTransfer: async () => true,
      txOwnerProofOptional: true,
      emitHubEvent
    })

    const response = await server.accessResponse(transferRequest(), RESOURCE)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.payment.verified).toBe(true)
    expect(emitHubEvent).toHaveBeenCalledTimes(2)
  })
})
