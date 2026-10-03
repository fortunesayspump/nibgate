// Agent spending policy: the money is given, not locked — but every outflow
// passes three gates before anything signs.
//
// 1. Configuration: no agent key, no spending tools. The deployment opts in
//    by setting DRNIB_AGENT_PRIVATE_KEY.
// 2. Per-call ceiling: a single tip/unlock/payment can never exceed its cap,
//    no matter what the model proposes.
// 3. Run balance: the run's own ledger must cover the call, checked before
//    signing (the stage charge after the fact is the audit trail, not the
//    gate — onchain sends are irreversible).
export const MAX_TIP_USD = Number(process.env.DRNIB_SPEND_MAX_TIP || 1);
export const MAX_UNLOCK_USD = Number(process.env.DRNIB_SPEND_MAX_UNLOCK || 2);
export const MAX_X402_USD = Number(process.env.DRNIB_SPEND_MAX_X402 || 2);

export function agentKey() {
  return process.env.DRNIB_AGENT_PRIVATE_KEY || '';
}

export function isSpendConfigured() {
  return Boolean(agentKey());
}

export function checkAmount(kind, amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'amount must be > 0' };
  const cap = kind === 'tip' ? MAX_TIP_USD : kind === 'unlock' ? MAX_UNLOCK_USD : MAX_X402_USD;
  if (n > cap) return { ok: false, error: `${kind} of $${n} exceeds the $${cap} per-call ceiling` };
  return { ok: true, amount: n };
}
