// Agent tipping through the hub's tip rail: challenge → direct transfer →
// verify. The hub mints the challenge (payee + protocol fee included in the
// amount the model proposes), the agent wallet signs the transfer, and the
// hub verifies onchain and returns a receipt. Same rail as browser users —
// the ledger cannot tell a machine tip from a human one.
import { config } from '../env.js';
import { budgetState } from '../money.js';
import { checkAmount } from './policy.js';
import { sendUsdc } from './wallet.js';

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

/**
 * Tip a page from the run's budget. Returns { receipt, txHash, amount }.
 * Throws on any failure; onchain sends happen only after every check passes.
 */
export async function tipCreator({ runId, contentUrl, amount, title, fetchImpl } = {}) {
  if (!contentUrl || typeof contentUrl !== 'string') throw new Error('contentUrl is required');
  const gate = checkAmount('tip', amount);
  if (!gate.ok) throw new Error(gate.error);
  const { balance } = await budgetState(runId);
  if (!(balance >= gate.amount)) throw new Error(`run balance $${balance.toFixed(2)} cannot cover a $${gate.amount.toFixed(2)} tip`);
  const post = fetchImpl || hub;
  const challenge = await post('/hub/tips/challenge', { contentUrl, title, amount: String(gate.amount), currency: 'USDC', paymentRail: 'transfer' });
  const payee = challenge?.payee;
  if (!payee) throw new Error('hub returned no payee for this tip');
  const txHash = await sendUsdc(payee, gate.amount);
  const verified = await post('/hub/tips/verify', {
    contentUrl, title, amount: String(gate.amount), currency: 'USDC',
    paymentRail: 'transfer', txHash,
  });
  if (!verified?.success) throw new Error(verified?.error || 'hub did not verify the tip transfer');
  return { receipt: verified.receipt || verified, txHash, amount: gate.amount, payee };
}
