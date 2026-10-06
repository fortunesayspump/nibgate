// Injected-state defense (Aomi § attacks): a compromised RPC can report a
// wrong balance, chain, or fee and the agent will sign a wrong-but-valid
// transaction while following authentic instructions. Before any value moves,
// the primary RPC is cross-checked against an independent backup endpoint:
// chain id must match exactly, block height must agree within tolerance.
// Activates only when DRNIB_RPC_BACKUP is set — without a second endpoint
// there is nothing to compare against, and a single-RPC deployment must say
// so (unconfigured = skipped, logged in the step outcome by callers).
const BLOCK_TOLERANCE = 50;

async function rpcCall(url, method, params, fetchImpl) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${method} HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`rpc ${method}: ${data.error.message || 'unknown'}`);
  return data?.result;
}

/**
 * Cross-check primary vs backup RPC. Returns { ok, skipped } — skipped when
 * no backup is configured. Throws on disagreement: callers treat it as a
 * refusal to sign, not a retryable blip.
 */
export async function crossCheckRpc({ chainId, rpcUrl, fetchImpl } = {}) {
  const backup = process.env.DRNIB_RPC_BACKUP || '';
  if (!backup) return { ok: true, skipped: true };
  const fetchFn = fetchImpl || fetch;
  const [chainA, chainB] = await Promise.all([
    rpcCall(rpcUrl, 'eth_chainId', [], fetchFn),
    rpcCall(backup, 'eth_chainId', [], fetchFn),
  ]);
  const want = `0x${Number(chainId).toString(16)}`;
  if (String(chainA).toLowerCase() !== want || String(chainB).toLowerCase() !== want) {
    throw new Error(`chain id disagreement (primary ${chainA}, backup ${chainB}, want ${want}) — refusing to sign`);
  }
  const [blockA, blockB] = await Promise.all([
    rpcCall(rpcUrl, 'eth_blockNumber', [], fetchFn),
    rpcCall(backup, 'eth_blockNumber', [], fetchFn),
  ]);
  if (Math.abs(Number(blockA) - Number(blockB)) > BLOCK_TOLERANCE) {
    throw new Error(`block height disagreement (${blockA} vs ${blockB}) — refusing to sign`);
  }
  return { ok: true, skipped: false };
}
