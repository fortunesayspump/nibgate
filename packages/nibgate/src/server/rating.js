/**
 * Server-side rating helpers for Nibgate reputation (on-chain via Arc testnet).
 *
 * Flow:
 *   1. prepareOnchainRating() → get contentHash + contract address
 *   2. Bot signs + sends tx to reputation contract
 *   3. submitOnchainRating() → verify tx, store rating, fire hub event
 *   4. getRatingStats() → hub-authoritative read (indexed first, contract fallback)
 *      readReputationStats() → low-level contentStats contract read
 *
 * The hub and satellite stacks must build on these helpers — never reimplement
 * hashing or contract reads locally. The SDK is the product; the hub harnesses it.
 */

import { createPublicClient, http } from 'viem';

export async function prepareOnchainRating({ contentId, walletAddress, ratingValue, paymentId, hubApiUrl }) {
  const api = hubApiUrl || process.env.NIBGATE_PUBLIC_API_URL || 'https://api.nibgate.xyz';
  const url = `${api}/hub/reputation/ratings/prepare`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentId, walletAddress, ratingValue, paymentId }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to prepare onchain rating');
  return {
    contentHash: data.contentHash,
    contractAddress: data.contractAddress,
    chainId: data.chainId,
    ratingValue: data.ratingValue,
    message: data.message,
  };
}

/**
 * Hub-authoritative rating read. The hub resolves the content (id or
 * externalId) against its own stored rows and serves indexed on-chain-proved
 * ratings (live contract read is the hub's fallback). Never recompute the
 * content hash locally — stored url/domain forms drift across stacks and
 * renames, which silently orphans the lookup.
 */
export async function getRatingStats({ contentId, hubApiUrl, timeoutMs = 10000 }) {
  if (!contentId) throw new Error('contentId is required to read rating stats.');
  const api = hubApiUrl || process.env.NIBGATE_PUBLIC_API_URL || 'https://api.nibgate.xyz';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${api}/hub/reputation/ratings/stats?contentId=${encodeURIComponent(contentId)}`, { signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (!data || !data.success) throw new Error((data && data.error) || 'Failed to read rating stats');
    return {
      contentId: data.contentId,
      externalId: data.externalId || null,
      contentHash: data.contentHash,
      average: data.average,
      count: Number(data.count) || 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Low-level contentStats read against the reputation contract. Prefer
 * getRatingStats() (hub-authoritative, rename-immune) unless you already hold
 * the exact contentHash that was written on-chain.
 */
export async function readReputationStats({ contentHash, contractAddress, rpcUrl, chainId, chainName = 'Arc', timeoutMs = 12000 }) {
  if (!contentHash) throw new Error('contentHash is required to read reputation stats.');
  if (!contractAddress) throw new Error('contractAddress is required to read reputation stats.');
  if (!rpcUrl) throw new Error('rpcUrl is required to read on-chain reputation stats.');
  const client = createPublicClient({
    chain: { id: Number(chainId), name: chainName, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } },
    transport: http(rpcUrl, { retryCount: 2, timeout: timeoutMs }),
  });
  const abi = [{ type: 'function', name: 'contentStats', stateMutability: 'view', inputs: [{ name: 'contentId', type: 'bytes32' }], outputs: [{ name: 'count', type: 'uint256' }, { name: 'total', type: 'uint256' }] }];
  const [count, total] = await client.readContract({ address: contractAddress, abi, functionName: 'contentStats', args: [contentHash] });
  return { count: Number(count), total: Number(total) };
}

export async function verifyRatingTx(txHash, rpcUrl) {
  if (!rpcUrl) throw new Error('RPC URL required to verify on-chain rating. Set ARC_RPC_URL or pass explicitly.');
  const url = rpcUrl;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method: 'eth_getTransactionReceipt', params: [txHash], id: 1, jsonrpc: '2.0' }),
  });
  const data = await res.json();
  const receipt = data?.result;
  if (!receipt || receipt.status !== '0x1') throw new Error('On-chain proof not found or invalid');
  return receipt;
}

export async function submitOnchainRating({ siteId, token, hubContentId, title, postType, price, walletAddress, rating, ratingValue, txHash, url: contentUrl, path: contentPath, hubApiUrl }) {
  const api = hubApiUrl || process.env.NIBGATE_PUBLIC_API_URL || 'https://api.nibgate.xyz';
  const evtUrl = `${api}/hub/evt`;
  const res = await fetch(evtUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      siteId, token, event: 'content_rating',
      resource: { id: hubContentId, title, type: postType || 'article', price: price || '' },
      walletAddress, rating, ratingValue, txHash,
      url: contentUrl, path: contentPath,
      proof: `onchain:${txHash}`, verified: true,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to submit rating');
  return data;
}
