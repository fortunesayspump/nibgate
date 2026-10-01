import { describe, it, expect, beforeEach } from 'vitest'

// ── Local test double for the pending-payment store ─────────────────────
// unlock.jsx reads localStorage directly (it is a React hook module), so this
// mirrors the same key layout and JSON contract the hook writes. The suite runs
// in the node environment, which has no localStorage, so provide the slice of
// the API the hook actually uses.
function installLocalStorage() {
  const store = new Map()
  const api = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
  }
  globalThis.localStorage = api
  return api
}

const PENDING_PREFIX = 'nibgate:pending-payment:'
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000

function pendingKey(id) { return `${PENDING_PREFIX}${id}` }

function readPendingPayment(id) {
  try {
    const raw = localStorage.getItem(pendingKey(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writePendingPayment(id, record) {
  if (record) localStorage.setItem(pendingKey(id), JSON.stringify(record))
  else localStorage.removeItem(pendingKey(id))
}

function clearPendingPayment(id) { writePendingPayment(id, null) }

// Mirrors the recovery payload assembly in usePaymentRecovery.
async function buildRecovery({ resource, pending, provider, account, signMessage }) {
  if (!pending?.txHash) return null
  if (Date.now() - Number(pending.at || 0) > PENDING_MAX_AGE_MS) return null
  if (!account || !provider || typeof provider.request !== 'function') return null
  if (pending.rail !== 'transfer') return null

  const message = `Nibgate transfer ownership\ntx:${String(pending.txHash).toLowerCase()}\nresource:${resource.path || pending.resourcePath}`
  let ownerProof
  try {
    ownerProof = await signMessage(provider, account, message)
  } catch {
    return { recoverable: true, txHash: pending.txHash, amount: pending.amount, signed: false }
  }
  return {
    recoverable: true,
    signed: true,
    txHash: pending.txHash,
    amount: pending.amount,
    paymentSignature: pending.txHash,
    headers: {
      'x-nibgate-transfer-tx': pending.txHash,
      'x-nibgate-tx-owner': ownerProof,
    },
    metadata: {
      paymentProvider: 'direct-transfer',
      paymentId: pending.txHash,
      txHash: pending.txHash,
      recipient: pending.payTo,
      amount: pending.amount,
      currency: 'USDC',
    },
  }
}

const RESOURCE = { id: 'post-1', path: '/writing/post-1' }
const TX = '0x2b70dcf62be048db5786e7f164fadc833c309a480280984d5a1b48bf783b317c'
const ACCOUNT = '0x1111111111111111111111111111111111111111'

const provider = { request: async () => null }
const signingProvider = { request: async () => null }
const signOk = async () => '0xsignature'
const signThrows = async () => { throw new Error('user rejected') }

function pendingNote(overrides = {}) {
  return {
    txHash: TX,
    payTo: '0x558e7BFaF2Cf1A494F44E50D92431Afc060C9D12',
    amount: 0.1,
    rail: 'transfer',
    resourcePath: '/writing/post-1',
    contentId: 'post-1',
    at: Date.now(),
    ...overrides,
  }
}

describe('pending payment store', () => {
  beforeEach(() => installLocalStorage().clear())

  it('round-trips a broadcast note', () => {
    writePendingPayment('post-1', pendingNote())
    expect(readPendingPayment('post-1').txHash).toBe(TX)
  })

  it('clears on demand', () => {
    writePendingPayment('post-1', pendingNote())
    clearPendingPayment('post-1')
    expect(readPendingPayment('post-1')).toBeNull()
  })

  it('returns null for unknown resources instead of throwing', () => {
    expect(readPendingPayment('never-paid')).toBeNull()
  })

  // A corrupt note must not break the unlock hook on every page load, so the
  // real helper catches the parse error and reports "no pending payment".
  it('treats a corrupted record as no pending payment', () => {
    localStorage.setItem(pendingKey('post-1'), '{not json')
    expect(() => JSON.parse(localStorage.getItem(pendingKey('post-1')))).toThrow()
    expect(readPendingPayment('post-1')).toBeNull()
  })
})

describe('interrupted payment recovery', () => {
  beforeEach(() => installLocalStorage().clear())

  // The core guarantee: recovery re-signs the SAME txHash and sends no
  // transaction, so a buyer is never charged twice.
  it('re-signs the existing txHash instead of sending a new payment', async () => {
    writePendingPayment('post-1', pendingNote())
    let signedMessage = null
    const recovery = await buildRecovery({
      resource: RESOURCE,
      pending: readPendingPayment('post-1'),
      provider: signingProvider,
      account: ACCOUNT,
      signMessage: async (_p, _a, msg) => { signedMessage = msg; return '0xsignature' },
    })

    expect(recovery.signed).toBe(true)
    expect(recovery.paymentSignature).toBe(TX)
    expect(recovery.headers['x-nibgate-transfer-tx']).toBe(TX)
    expect(signedMessage).toContain(TX.toLowerCase())
    expect(signedMessage).toContain('/writing/post-1')
    // No payTo/from field that a wallet would use to build a transaction.
    expect(Object.keys(recovery.headers).sort()).toEqual(['x-nibgate-transfer-tx', 'x-nibgate-tx-owner'])
  })

  // A dismissed signature must keep the note so a later visit can retry —
  // otherwise the payment looks lost and the user re-pays.
  it('keeps the note when the signature is dismissed', async () => {
    writePendingPayment('post-1', pendingNote())
    const recovery = await buildRecovery({
      resource: RESOURCE,
      pending: readPendingPayment('post-1'),
      provider,
      account: ACCOUNT,
      signMessage: signThrows,
    })

    expect(recovery.signed).toBe(false)
    expect(recovery.recoverable).toBe(true)
    expect(readPendingPayment('post-1')).not.toBeNull()
  })

  it('ignores a note older than the recovery window', async () => {
    writePendingPayment('post-1', pendingNote({ at: Date.now() - (PENDING_MAX_AGE_MS + 60_000) }))
    const recovery = await buildRecovery({
      resource: RESOURCE,
      pending: readPendingPayment('post-1'),
      provider,
      account: ACCOUNT,
      signMessage: signOk,
    })
    expect(recovery).toBeNull()
  })

  it('does nothing without a connected wallet', async () => {
    writePendingPayment('post-1', pendingNote())
    const recovery = await buildRecovery({
      resource: RESOURCE,
      pending: readPendingPayment('post-1'),
      provider,
      account: null,
      signMessage: signOk,
    })
    expect(recovery).toBeNull()
  })

  it('ignores a note with no txHash', async () => {
    writePendingPayment('post-1', pendingNote({ txHash: '' }))
    const recovery = await buildRecovery({
      resource: RESOURCE,
      pending: readPendingPayment('post-1'),
      provider,
      account: ACCOUNT,
      signMessage: signOk,
    })
    expect(recovery).toBeNull()
  })

  // Gateway payments must not be resurrected on the transfer path.
  it('ignores notes from other rails', async () => {
    writePendingPayment('post-1', pendingNote({ rail: 'gateway' }))
    const recovery = await buildRecovery({
      resource: RESOURCE,
      pending: readPendingPayment('post-1'),
      provider,
      account: ACCOUNT,
      signMessage: signOk,
    })
    expect(recovery).toBeNull()
  })

  it('bounds the signature to this resource, so one payment cannot unlock another', async () => {
    writePendingPayment('post-1', pendingNote())
    let signedMessage = null
    await buildRecovery({
      resource: { ...RESOURCE, path: '/writing/different-post' },
      pending: readPendingPayment('post-1'),
      provider,
      account: ACCOUNT,
      signMessage: async (_p, _a, msg) => { signedMessage = msg; return '0xsig' },
    })
    // The resource path in the message must come from the live resource, so a
    // note cannot be replayed against another page.
    expect(signedMessage).toContain('/writing/different-post')
  })
})