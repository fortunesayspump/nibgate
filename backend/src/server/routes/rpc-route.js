const RPC_URL = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc-node.thecanteenapp.com/v1/'

const ALLOWED_METHODS = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getLogs',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
  'net_version',
])

const rateLimiter = new Map()

function checkRateLimit(ip) {
  const now = Date.now()
  const window = 60_000
  const max = 120
  const entry = rateLimiter.get(ip)
  if (!entry || now - entry.start > window) {
    rateLimiter.set(ip, { start: now, count: 1 })
    return true
  }
  entry.count++
  return entry.count <= max
}

export function registerRpcRoute(app) {
  app.all('/api/rpc', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many RPC requests. Slow down.' })
    }

    if (req.method === 'OPTIONS') return res.status(204).end()

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Only POST is allowed' })
    }

    const raw = typeof req.body === 'object' ? req.body : {}
    const method = raw.method

    if (!method || !ALLOWED_METHODS.has(method)) {
      return res.status(403).json({ error: 'RPC method not allowed' })
    }

    try {
      const rpcRes = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(raw),
      })
      const data = await rpcRes.json()
      res.json(data)
    } catch (error) {
      res.status(502).json({ error: 'RPC proxy failed' })
    }
  })
}
