// Agent tipping through the hub's tip rail: challenge → direct transfer →
// verify. The hub mints the challenge (payee + protocol fee included in the
// amount the model proposes), the agent wallet signs the transfer, and the
// hub verifies onchain and returns a receipt. Same rail as browser users —
// the ledger cannot tell a machine tip from a human one.
import { config } from '../env.js';
import { budgetState } from '../money.js';
import { checkAmount } from './policy.js';
import { sendUsdc, spenderAddress, spendViaContract } from './wallet.js';
import { spendChain } from './chain.js';
import { crossCheckRpc } from './guard.js';

/** Route a tip transfer: mandate contract when configured, raw EOA otherwise. */
export async function moveFunds(payee, amount, { held = false } = {}) {
  // Held-tip refunds require an EOA signature from the recorded payer. The
  // current spender contract cannot sign, so keep refundable holds on the EOA.
  if (!held && spenderAddress()) return spendViaContract(payee, amount);
  return sendUsdc(payee, amount);
}

async function hub(path, body) {
  const res = await fetch(`${config.hubApiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `hub ${path}: ${res.status}`);
  return data;
}

function validateContentUrl(contentUrl){
  if (!contentUrl || typeof contentUrl !== 'string') throw new Error('contentUrl is required');
  // A creator page, not an API endpoint: tipping an /api/ URL banks money
  // against a JSON blob instead of someone's work. Fail fast with direction.
  try {
    if (new URL(contentUrl).pathname.startsWith('/api/')) {
      throw new Error('contentUrl looks like an API endpoint, not a creator page — tip the page URL from the site, not the API that listed it');
    }
  } catch (e) {
    if (e.message.startsWith('contentUrl looks like')) throw e;
    throw new Error('contentUrl is not a valid URL');
  }
}

/**
 * Tip a page from the run's budget. Returns { receipt, txHash, amount }.
 * Throws on any failure; onchain sends happen only after every check passes.
 *
 * Resolved creators settle instantly (challenge → transfer → verify).
 * External/unresolved pages fall back to the holding box (hold challenge →
 * fund box → verify held): the domain owner claims later, the payer can
 * refund until then. Same hub rails browsers use — the ledger cannot tell a
 * machine tip from a human one.
 */
export async function tipCreator({ runId, contentUrl, amount, title, recipient, fetchImpl, resolveImpl } = {}) {
  validateContentUrl(contentUrl);
  const gate=checkAmount('tip',amount);if(!gate.ok)throw Error(gate.error);
  const {balance}=await budgetState(runId);if(balance<gate.amount)throw Error(`run balance $${balance.toFixed(2)} cannot cover a $${gate.amount.toFixed(2)} tip`);
  return executePublicTip({contentUrl,amount,title,recipient,fetchImpl,resolveImpl});
}

/** Public money operation only. The isolated private money service reserves
 * its own ledger before calling this; no research or document state enters. */
export async function executePublicTip({contentUrl,amount,title,recipient,fetchImpl,resolveImpl}={}){
  validateContentUrl(contentUrl);
  const gate = checkAmount('tip', amount);
  if (!gate.ok) throw new Error(gate.error);
  const post = fetchImpl || hub;
  // A model-supplied recipient is not proof of ownership. Resolve the page
  // through the hub's verified index before making a direct creator payment.
  const resolve = resolveImpl || (async (url) => {
    const res = await fetch(`${config.hubApiUrl}/hub/resolve?url=${encodeURIComponent(url)}`);
    return res.ok ? res.json() : null;
  });
  const indexed = await resolve(contentUrl).catch(() => null);
  const verifiedRecipient = indexed?.success && /^0x[0-9a-fA-F]{40}$/.test(indexed.wallet || '')
    ? indexed.wallet : null;
  if (recipient && verifiedRecipient && recipient.toLowerCase() !== verifiedRecipient.toLowerCase()) {
    throw new Error('proposed tip recipient disagrees with the verified creator wallet');
  }
  let challenge = null;
  if (verifiedRecipient) {
    challenge = await post('/hub/tips/challenge', { contentUrl, title, amount: String(gate.amount), currency: 'USDC', paymentRail: 'transfer', recipient: verifiedRecipient });
  }
  if (challenge?.payee) {
    const chain = spendChain();
    await crossCheckRpc({ chainId: chain.chainId, rpcUrl: chain.rpcUrl });
    const txHash = await moveFunds(challenge.payee, gate.amount);
    const verified = await post('/hub/tips/verify', {
      contentUrl, title, amount: String(gate.amount), currency: 'USDC',
      paymentRail: 'transfer', txHash, recipient: verifiedRecipient,
    });
    if (!verified?.success) throw new Error(verified?.error || 'hub did not verify the tip transfer');
    return { receipt: verified.receipt || verified, txHash, amount: gate.amount, payee: challenge.payee, held: false };
  }
  // No direct payee (external/unresolved creator): hold in the domain box.
  const hold = await post('/hub/tips/hold', { contentUrl, title, amount: String(gate.amount), currency: 'USDC', paymentRail: 'transfer' });
  const box = hold?.box;
  if (!box) throw new Error(hold?.error || 'hub returned no holding box for this tip');
  await crossCheckRpc({ chainId: spendChain().chainId, rpcUrl: spendChain().rpcUrl });
  const txHash = await moveFunds(box, gate.amount, { held: true });
  const held = await post('/hub/tips/hold', {
    contentUrl, title, amount: String(gate.amount), currency: 'USDC',
    paymentRail: 'transfer', txHash,
  });
  if (held?.holdStatus !== 'held') throw new Error(held?.error || 'hub did not verify the held tip');
  return { receipt: held.tip || held, txHash, amount: gate.amount, payee: box, held: true };
}
