const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// Pure, DB-free implementation of the Nibgate access rule (ACCESS-CONTROL-DESIGN
// §4 + §6). The hub (NibShare) and subblogs both import these helpers so the
// gate lives in exactly one place. Callers pass the gating policy fields and the
// caller-DB facts (entitlement, receipt) — nothing here touches a database.
//
// A "policy" is any object with the shape:
//   { price, whitelist: string[], whitelistPrice: string|number|null|undefined,
//     publicAccess: boolean }
// (NibShare and BlogPost rows both satisfy this; whitelistPrice null = whitelist
// pays the public price, '0' = whitelist free tier.)

export function normalizeWalletAddress(value) {
  const w = String(value || '').trim().toLowerCase();
  return ADDR_RE.test(w) ? w : null;
}

export function normalizeWhitelist(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((w) => normalizeWalletAddress(w)).filter(Boolean))];
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// True when the public/list price signals a paid gate (price > 0).
export function isPaidValue(value) {
  return toNumber(value) > 0;
}

// Legacy "open list" semantic: empty whitelist means everyone is (implicitly)
// allowed as far as membership goes.
export function isWhitelisted(policy, wallet) {
  const whitelist = Array.isArray(policy?.whitelist) ? policy.whitelist : [];
  return whitelist.length === 0 || whitelist.includes(String(wallet).trim().toLowerCase());
}

// Strict membership: wallet is listed AND the list is non-empty. Used for tier
// pricing and invite-only enforcement, where an empty list must not grant
// everyone a whitelist tier.
export function inWhitelist(policy, wallet) {
  const whitelist = Array.isArray(policy?.whitelist) ? policy.whitelist : [];
  return whitelist.length > 0 && whitelist.includes(String(wallet).trim().toLowerCase());
}

// The price THIS wallet must pay right now (number).
//   whitelist member + whitelistPrice set   -> whitelistPrice
//   everything else                          -> policy.price (public tier)
export function effectivePrice(policy, wallet) {
  if (inWhitelist(policy, wallet) && policy.whitelistPrice != null && policy.whitelistPrice !== '') {
    return toNumber(policy.whitelistPrice);
  }
  return toNumber(policy?.price);
}

// Non-payment membership gate (who is allowed to even try). Payment and
// entitlement state are layered on top by canAccess.
//   publicAccess=false -> invite-only: only listed wallets may try.
//   publicAccess=true  -> everyone may try; whitelist members simply get the
//                         whitelistPrice tier.
export function accessDecision(policy, wallet) {
  if (policy?.publicAccess === false && !inWhitelist(policy, wallet)) {
    return { ok: false, reason: 'invite-only', message: 'This content is invite-only.' };
  }
  return { ok: true };
}

// Full §4 rule, evaluated before any proof freshness is trusted. `facts`:
//   wallet?            resolved wallet (null = anonymous charge path)
//   entitlement?       { status: 'active'|'revoked'|'banned' } | null
//   hasPaidReceipt?    bool — a real receipt with amount > 0 exists for wallet
//   proofValid?        bool — an untampered, bound proof was presented
// Returns:
//   { allowed, reason, grant, message, challenge }
//   allowed true  -> serve content; grant ∈ 'paid'|'free'|'proof'|null
//   allowed false -> reason ∈ 'banned'|'revoked'|'invite-only'|'payment-required'
export function canAccess(policy, facts = {}) {
  const wallet = facts.wallet || null;
  const ent = facts.entitlement || null;
  const entStatus = ent && typeof ent === 'object' ? ent.status : null;
  const hasEnt = Boolean(ent);
  const hasPaidReceipt = Boolean(facts.hasPaidReceipt);
  const proofValid = Boolean(facts.proofValid);
  const paid = isPaidValue(policy?.price);
  // Gated when a payment is required OR access is invite-only. A fully public
  // free post has no gate, so ban/revoke history on a anonymous-viewer cannot
  // be enforced (and need not be).
  const gated = paid || policy?.publicAccess === false;

  if (policy?.publicAccess === false) {
    if (!wallet || !inWhitelist(policy, wallet)) {
      return { allowed: false, reason: 'invite-only', grant: null, message: 'This content is invite-only.', challenge: false };
    }
  }

  if (entStatus === 'banned' && (gated || hasEnt)) {
    return { allowed: false, reason: 'banned', grant: null, message: 'This wallet is banned from this content.', challenge: false };
  }
  if (entStatus === 'revoked' && (gated || hasEnt)) {
    return { allowed: false, reason: 'revoked', grant: null, message: 'Access has been revoked. Pay again to re-unlock.', challenge: false };
  }

  if (!paid) {
    // Free gate: an active entitlement (or being inside the membership) grants.
    if (entStatus === 'active') return { allowed: true, reason: null, grant: 'free', message: null, challenge: false };
    if (proofValid && wallet) return { allowed: true, reason: null, grant: 'proof', message: null, challenge: false };
    return { allowed: true, reason: null, grant: 'free', message: null, challenge: false };
  }

  // Paid gate.
  const eff = wallet ? effectivePrice(policy, wallet) : toNumber(policy?.price);
  // Rule 6 — lifetime: active entitlement backed by a real paid receipt.
  if (entStatus === 'active' && hasPaidReceipt) {
    return { allowed: true, reason: null, grant: 'paid', message: null, challenge: false };
  }
  // Whitelist free tier (whitelistPrice=0 member of a paid post): grant free.
  if (wallet && eff === 0) {
    return { allowed: true, reason: null, grant: 'free', message: null, challenge: false };
  }
  // Legacy free grant on a now-paid share: served free till expiry (row 5).
  if (entStatus === 'active') {
    return { allowed: true, reason: null, grant: 'free', message: null, challenge: false };
  }
  // Rule 8 — proof fast path (entitlement absent but a bound, fresh proof shown).
  if (proofValid && wallet) {
    return { allowed: true, reason: null, grant: 'proof', message: null, challenge: false };
  }
  return { allowed: false, reason: 'payment-required', grant: null, message: 'Payment required.', challenge: true };
}

export function hasPaidReceipt(receipt) {
  return Boolean(receipt && toNumber(receipt.amount) > 0);
}

// Gap #11 (ACCESS-CONTROL-DESIGN §6 row 7): wallets whose active paid
// entitlement would be cut off by an invite-only flip under the NEW whitelist.
// Receipts shape: [{ payerWallet, amount }].
export function paidCutoffWallets({ policy, entitlements, receipts = [] }) {
  const paidByWallet = new Map();
  for (const r of receipts || []) {
    if (hasPaidReceipt(r)) paidByWallet.set(normalizeWalletAddress(r.payerWallet), true);
  }
  return (entitlements || [])
    .filter((e) => e?.status === 'active' && !inWhitelist(policy, e.wallet) && paidByWallet.has(normalizeWalletAddress(e.wallet)))
    .map((e) => String(e.wallet).toLowerCase());
}