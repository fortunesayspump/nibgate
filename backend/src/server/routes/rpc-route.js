import { activeNetwork } from '@nibgate/internal/networks.js';
import { registerRateBuckets } from '../lib/rate-buckets.js';

const NET = activeNetwork();
const RPC_URL = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || NET.reputationRpcUrl;
const RPC_URLS = [...new Set([RPC_URL, ...(process.env.ARC_RPC_FALLBACK_URLS || '').split(',').map((url) => url.trim()).filter(Boolean)])];
const verifiedChains = new Map();
const RPC_TIMEOUT_MS = 8_000;

async function rpcRequest(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error && /rate limit|too many requests|quota|capacity|temporarily unavailable/i.test(String(data.error.message))) {
    throw new Error('RPC temporarily unavailable');
  }
  return data;
}

async function verifiedRpcRequest(url, body) {
  if (!verifiedChains.has(url)) {
    const check = rpcRequest(url, { jsonrpc: '2.0', id: 'chain-check', method: 'eth_chainId', params: [] })
      .then((data) => data?.result?.toLowerCase() === NET.chainIdHex.toLowerCase());
    verifiedChains.set(url, check);
  }
  const valid = await verifiedChains.get(url).catch(() => false);
  if (!valid) {
    verifiedChains.delete(url);
    throw new Error('RPC chain mismatch or unavailable');
  }
  return rpcRequest(url, body);
}

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

const rateLimiter = registerRateBuckets(new Map(), 60_000)

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
      for (const url of RPC_URLS) {
        try {
          return res.json(await verifiedRpcRequest(url, raw));
        } catch {
          // Only transport, provider capacity and chain-check failures reach here.
        }
      }
      return res.status(502).json({ error: 'RPC proxy failed' })
    } catch (error) {
      res.status(502).json({ error: 'RPC proxy failed' })
    }
  })
}
