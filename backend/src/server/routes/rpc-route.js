const RPC_URL = process.env.NIBGATE_REPUTATION_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc-node.thecanteenapp.com/v1/'

export function registerRpcRoute(app) {
  app.all('/api/rpc', async (req, res) => {
    try {
      const body = typeof req.body === 'object' ? req.body : {}
      const rpcRes = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await rpcRes.json()
      res.json(data)
    } catch (error) {
      res.status(502).json({ error: 'RPC proxy failed', details: error.message })
    }
  })
}
