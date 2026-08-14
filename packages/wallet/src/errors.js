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
  default: 'Payment could not be verified. Check your balance and try again.',
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
