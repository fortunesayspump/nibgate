// Agent rating of Nibgate content it relied on: resolve the hub content id,
// prepare the rating, submit rateContent from the agent wallet, and index the
// proof — the same rail browser ratings use, so the ledger cannot tell a
// machine rating from a human one.
//
// Two hard rules: (1) no unlock, no rating — ratings without an unlock
// receipt don't count, so rating blind is refused with direction; (2) the
// prepare answer names the chain and contract, and the wallet submits only
// when they match this deployment's spend chain (a rating on the wrong
// network burns gas and indexes nowhere).
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../env.js';
import { budgetState } from '../money.js';
import { agentKey, isSpendConfigured } from './policy.js';
import { spendChain } from './chain.js';
import { crossCheckRpc } from './guard.js';

const RATE_ABI = [
  {
    type: 'function',
    name: 'rateContent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contentId', type: 'bytes32' },
      { name: 'rating', type: 'uint8' },
      { name: 'reviewHash', type: 'bytes32' },
      { name: 'unlockRef', type: 'string' },
    ],
    outputs: [],
  },
];
const ZERO_HASH = '0x' + '0'.repeat(64);
// Gas dust gate: a rating moves no value, but the tx burns gas (USDC on Arc).
// Refuse on an empty run rather than spending the operator's gas for nothing.
const MIN_BALANCE_USD = 0.05;

function hubBase() {
  return String(config.hubApiUrl || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Resolve a page URL to its hub content id via the explore index. */
async function resolveContentId(url, fetchImpl) {
  const f = fetchImpl || fetch;
  const q = new URL('/hub/explore/content', hubBase());
  q.searchParams.set('limit', '100');
  try {
    const host = new URL(String(url)).hostname.replace(/^www\./, '');
    q.searchParams.set('q', host);
  } catch { q.searchParams.set('q', String(url).slice(0, 80)); }
  const res = await f(q, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`hub explore lookup failed: ${res.status}`);
  const body = await res.json().catch(() => ({}));
  const items = body?.content || body?.items || [];
  const norm = String(url).replace(/\/+$/, '');
  const hit = items.find((c) => String(c?.url || '').replace(/\/+$/, '') === norm)
    || items.find((c) => { try { return new URL(c?.url || '').href === new URL(norm).href; } catch { return false; } });
  if (!hit) throw new Error('page is not indexed hub content — rate needs a hub content id, unlock first and pass contentId when known');
  return hit.externalId || hit.id;
}

/**
 * Rate hub content from the run's budget context. Returns { txHash, ratingValue }.
 * Needs { stars 1-5, unlockRef } plus contentId or url. Throws on any failure;
 * the wallet signs only after every check passes.
 */
export async function rateContent({ runId, contentId, url, stars, unlockRef, fetchImpl } = {}) {
  if (!isSpendConfigured()) throw new Error('agent spending is not configured on this deployment');
  const s = Number(stars);
  if (!Number.isFinite(s) || s < 1 || s > 5) throw new Error('stars must be 1-5');
  if (!unlockRef || !String(unlockRef).trim()) {
    throw new Error('rating needs unlockRef (the unlock_content payment tx) — ratings without an unlock receipt do not count, unlock the piece first');
  }
  const { balance } = await budgetState(runId);
  if (!(balance >= MIN_BALANCE_USD)) throw new Error(`run balance $${Number(balance).toFixed(2)} is below the $${MIN_BALANCE_USD.toFixed(2)} rating dust gate`);
  const id = contentId || (url ? await resolveContentId(url, fetchImpl) : null);
  if (!id) throw new Error('contentId or url is required');
  const f = fetchImpl || fetch;
  const account = privateKeyToAccount(agentKey());
  const prepRes = await f(`${hubBase()}/hub/reputation/ratings/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentId: id, walletAddress: account.address, ratingValue: Math.round(s * 10) }),
  });
  const prep = await prepRes.json().catch(() => ({}));
  if (!prepRes.ok || !prep?.success) throw new Error(prep?.error || `rating prepare failed: ${prepRes.status}`);
  const chain = spendChain();
  if (Number(prep.chainId) !== Number(chain.chainId)) {
    throw new Error(`rating lives on chain ${prep.chainId}, this deployment spends on ${chain.chainId} — refusing cross-network rating`);
  }
  await crossCheckRpc({ chainId: chain.chainId, rpcUrl: chain.rpcUrl });
  const viemChain = { id: chain.chainId, name: `arc-${chain.name}`, nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [chain.rpcUrl] } } };
  const transport = http(chain.rpcUrl);
  const wallet = createWalletClient({ chain: viemChain, transport, account });
  const pub = createPublicClient({ chain: viemChain, transport });
  const ratingValue = Math.max(1, Math.min(50, Math.round(s * 10)));
  const hash = await wallet.writeContract({
    address: prep.contractAddress,
    abi: RATE_ABI,
    functionName: 'rateContent',
    args: [prep.contentHash, ratingValue, ZERO_HASH, String(unlockRef)],
  });
  try { await pub.waitForTransactionReceipt({ hash }); } catch { /* may still mine; index verifies */ }
  const indexed = await f(`${hubBase()}/hub/reputation/ratings/index`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentId: id, txHash: hash, walletAddress: account.address, contentHash: prep.contentHash, ratingValue }),
  }).then((r) => r.json()).catch(() => ({}));
  return { txHash: hash, ratingValue, contentId: id, indexed: indexed?.success ?? null };
}
