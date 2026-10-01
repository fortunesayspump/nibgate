export const WALLET_ERRORS = {
  rejected: 'Request cancelled.',
  pending: 'Check your wallet to approve the pending request.',
  unauthorized: 'Reconnect your wallet and approve access to continue.',
  unsupportedChain: 'Your wallet is on a network that is not supported.',
  insufficientFunds: 'Insufficient funds to complete this transaction.',
  default: 'Something went wrong with your wallet. Please try again.',
};

// Map x402 / Circle Gateway verify-settle reason strings to friendly, human
// copy instead of surfacing the raw facilitator reason (finding #1).
export const PAYMENT_ERRORS = {
  insufficient_balance: 'Payment failed — your USDC balance is too low. Add funds to your wallet and try again.',
  insufficient_allowance: 'Payment failed — your USDC allowance for the gateway is too low. Approve a higher amount and try again.',
  expired_challenge: 'This payment request expired. Please try again.',
  invalid_price: 'The price changed while you were paying. Please review and try again.',
  invalid_recipient: 'This payment could not reach the creator. Please try again.',
  unauthorized: 'The gateway could not verify this payment. Please try again.',
  already_used: 'This payment was already used. The content may already be unlocked — refresh to check.',
  invalid_signature: 'The payment signature could not be verified. Please try again.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',

  // ── Pre-broadcast preflight reasons ────────────────────────────────────
  // These abort BEFORE any transfer is broadcast, so no money has moved and
  // retrying is safe. The copy says so explicitly — reusing the post-broadcast
  // "don't pay again" wording here would wrongly alarm the user.
  'preflight-payto-unresolved': 'This payment can’t be set up right now — the payment address didn’t resolve. Nothing was charged.',
  'preflight-not-payable': 'This content isn’t priced for direct payment. Nothing was charged.',
  'preflight-invalid-amount': 'That payment amount wasn’t valid, so nothing was charged. Please try again.',
  'preflight-amount-mismatch': 'The price changed before your payment went through, so nothing was charged. Refresh to see the current price.',
  'preflight-invalid-payer': 'We couldn’t read your wallet address, so nothing was charged. Reconnect your wallet and try again.',
  'preflight-insufficient-balance': 'Your USDC balance is lower than the price of this content, so nothing was charged. Add funds and try again.',
  'preflight-rate-limited': 'Too many payment attempts. Wait a moment and try again — nothing was charged.',

  // ── Post-broadcast direct-rail reasons ───────────────────────────────────
  // These are NOT safe to "try again": the transfer may already be mined and
  // irrevocable on-chain. Re-broadcasting risks paying twice for one unlock, so
  // the copy tells the user what actually happened and that support can sort it
  // out against the tx hash.
  'transfer-ownership-proof-required': 'Your payment was sent but the confirmation step did not complete. Do not pay again — contact support with your transaction hash and we will finish unlocking your content.',
  'transfer-owner-mismatch': 'Your payment was sent but we could not confirm it came from the paying wallet. Do not pay again — contact support with your transaction hash.',
  'transfer-owner-invalid': 'Your payment was sent but the confirmation signature was not readable. Do not pay again — contact support with your transaction hash.',
  'txhash-claimed-elsewhere': 'That payment was already applied to different content. Refresh to see what it unlocked, or contact support with your transaction hash.',
  'claim-registry-unreachable': 'We could not record your payment right now. Your transfer may have gone through — contact support with your transaction hash before paying again.',

  // Fallback must never mention balance (insufficient_balance is mapped above,
  // so reaching here means an unknown failure) and must never invite a retry on
  // a rail that may have already charged the user.
  default: 'Something went wrong confirming this payment. If you completed the payment, contact support with your transaction hash before trying again.',
};

export function getPaymentErrorMessage(error, { fallback = PAYMENT_ERRORS.default } = {}) {
  if (!error) return fallback;
  const text =
    typeof error === 'string' ? error : (error?.reason ?? error?.errorReason ?? error?.invalidReason ?? error?.error ?? error?.message ?? '');
  const lowered = String(text).toLowerCase();
  for (const [key, friendly] of Object.entries(PAYMENT_ERRORS)) {
    if (key === 'default') continue;
    if (lowered.includes(key.replace(/_/g, ' ')) || lowered.includes(key)) return friendly;
  }
  return fallback;
}

export function getWalletErrorMessage(error, { defaultMessage = WALLET_ERRORS.default } = {}) {
  if (!error) return null;

  const message =
    typeof error === 'string' ? error : (error?.shortMessage ?? error?.message ?? '');

  const code = error?.code;
  if (typeof code === 'number') {
    if (code === 4001) return WALLET_ERRORS.rejected;
    if (code === -32002) return WALLET_ERRORS.pending;
    if (code === 4100) return WALLET_ERRORS.unauthorized;
    if (code === 4902) return WALLET_ERRORS.unsupportedChain;
  } else if (typeof code === 'string' && /^0x[0-9a-f]+$/i.test(code)) {
    const hexCode = BigInt(code);
    if (hexCode === 4001n) return WALLET_ERRORS.rejected;
    if (hexCode === 4902n) return WALLET_ERRORS.unsupportedChain;
  }

  const lowered = message.toLowerCase();
  if (lowered.includes('user rejected') || lowered.includes('user denied') || lowered.includes('user cancelled')) {
    return WALLET_ERRORS.rejected;
  }
  if (lowered.includes('pending request') || lowered.includes('pending:') || lowered.includes('already pending')) {
    return WALLET_ERRORS.pending;
  }
  if (lowered.includes('not been authorized') || lowered.includes('unauthorized')) {
    return WALLET_ERRORS.unauthorized;
  }
  if (lowered.includes('insufficient funds')) {
    return WALLET_ERRORS.insufficientFunds;
  }

  return defaultMessage;
}

export function isWalletRejection(error) {
  return getWalletErrorMessage(error) === WALLET_ERRORS.rejected;
}
