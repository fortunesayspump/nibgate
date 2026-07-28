/**
 * Server-side rating helpers for Nibgate reputation (on-chain via Arc testnet).
 *
 * Flow:
 *   1. prepareOnchainRating() → get contentHash + contract address
 *   2. Bot signs + sends tx to reputation contract
 *   3. submitOnchainRating() → verify tx, store rating, fire hub event
 */

export async function prepareOnchainRating({ contentId, walletAddress, ratingValue, paymentId, hubApiUrl }) {
  const api = hubApiUrl || process.env.NIBGATE_PUBLIC_API_URL || 'https://api.nibgate.xyz';
  const url = `${api}/api/hub/reputation/ratings/prepare`;
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
  const evtUrl = `${api}/api/hub/evt`;
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
