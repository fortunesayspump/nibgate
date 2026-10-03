// Agent unlocks and x402 payments through Circle's batching client — the same
// documented agent path creator SDKs use (SKILL.md § agent payments). The
// wallet signs an EIP-3009 authorization, the client settles and retries the
// resource, and the content comes back.
//
// Price honesty, enforced in order: the 402 challenge is free to read, so the
// exact price is known BEFORE anything signs. The run balance must cover that
// exact price (no cap-overshoot window), and a per-call hook still aborts
// anything over the ceiling at signing time — the model can never talk its
// way past either gate.
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { budgetState } from '../money.js';
import { checkAmount, agentKey } from './policy.js';
import { spendChain } from './chain.js';

/** Read the price off a 402 challenge without paying. Returns dollars (0 = free). */
export async function previewPrice(url, fetchImpl) {
  const fetchFn = fetchImpl || fetch;
  const res = await fetchFn(String(url), { headers: { 'x-nibgate-actor': 'agent', accept: 'application/json' } });
  if (res.status !== 402) return { price: 0, free: true };
  const header = res.headers?.get ? (res.headers.get('payment-required') || res.headers.get('x-payment-required')) : null;
  const bodies = [];
  if (header) {
    try { bodies.push(JSON.parse(Buffer.from(String(header).trim(), 'base64').toString('utf8'))); } catch {}
  }
  // The body reads once: try it as JSON, otherwise it is not a challenge.
  try {
    const text = await res.text();
    if (text) bodies.push(JSON.parse(text));
  } catch {}
  for (const body of bodies) {
    const accepts = body?.accepts || body?.payment?.accepts || [];
    for (const a of accepts) {
      const raw = a?.maxAmountRequired ?? a?.amount ?? a?.maxAmount;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return { price: n > 1000 ? n / 1e6 : n, free: false, currency: a?.asset || a?.currency || 'USDC' };
    }
  }
  return { price: 0, free: false, unknown: true };
}

function clientForCap(cap) {
  const chain = spendChain();
  const client = new GatewayClient({
    chain: chain.gatewayChain,
    privateKey: agentKey(),
    rpcUrl: chain.rpcUrl,
  });
  client.onBeforePaymentCreation(async (ctx) => {
    try {
      const amount = Number(ctx?.selectedRequirements?.amount) / 1e6;
      if (Number.isFinite(amount) && amount > cap) return { abort: true, reason: `payment $${amount} exceeds the $${cap} ceiling` };
    } catch {}
    return undefined;
  });
  return client;
}

async function ensureExact(runId, kind, price) {
  const gate = checkAmount(kind, price);
  if (!gate.ok) throw new Error(gate.error);
  const { balance } = await budgetState(runId);
  if (!(balance >= gate.amount)) throw new Error(`run balance $${balance.toFixed(2)} cannot cover $${gate.amount.toFixed(2)}`);
  return gate.amount;
}

// Gateway authorizations draw from the GatewayWallet balance, not the raw
// wallet: top it up from the agent's USDC first when short. The deposit is
// itself onchain (Arc's gas token is USDC, so one balance covers both).
async function ensureGatewayFunded(client, price) {
  const balances = await client.getBalances();
  const available = Number(balances?.gateway?.available ?? 0n) / 1e6;
  if (available >= price) return;
  const wallet = Number(balances?.wallet?.balance ?? balances?.wallet?.formatted ?? 0);
  if (!(wallet >= price)) {
    throw new Error(`agent wallet holds $${wallet.toFixed(2)} USDC — fund it before paid unlocks can work`);
  }
  await client.deposit(String(price.toFixed(2)));
}

/** Pay an x402 resource and return its content. Returns { data, txHash, amount }. */
export async function payX402({ runId, url, fetchImpl } = {}) {
  if (!url || !/^https:\/\//i.test(String(url))) throw new Error('pay_x402 needs a public https URL');
  const cap = Number(process.env.DRNIB_SPEND_MAX_X402 || 2);
  const preview = await previewPrice(url, fetchImpl);
  if (preview.unknown) throw new Error('no readable price on this 402 — refusing to sign blind');
  const amount = await ensureExact(runId, 'x402', preview.price);
  const client = clientForCap(cap);
  await ensureGatewayFunded(client, amount);
  const out = await client.pay(String(url), { headers: { 'x-nibgate-actor': 'agent' } });
  const paid = Number(out?.formattedAmount) || amount;
  return { data: out?.data ?? null, txHash: out?.transaction || null, amount: paid, raw: out };
}

/** Unlock paid Nibgate content: same x402 pay, shaped as evidence. */
export async function unlockContent({ runId, url, fetchImpl } = {}) {
  if (!url || !/^https:\/\//i.test(String(url))) throw new Error('unlock needs a public https URL');
  const cap = Number(process.env.DRNIB_SPEND_MAX_UNLOCK || 2);
  const preview = await previewPrice(url, fetchImpl);
  if (preview.unknown) throw new Error('no readable price on this 402 — refusing to sign blind');
  const amount = await ensureExact(runId, 'unlock', preview.price);
  const client = clientForCap(cap);
  await ensureGatewayFunded(client, amount);
  const out = await client.pay(String(url), { headers: { 'x-nibgate-actor': 'agent' } });
  const paid = Number(out?.formattedAmount) || amount;
  const body = out?.data;
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return { data: body ?? null, text: text.slice(0, 8000), txHash: out?.transaction || null, amount: paid };
}
