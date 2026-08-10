export const WALLET_ERRORS = {
  rejected: 'Request cancelled.',
  pending: 'Check your wallet to approve the pending request.',
  unauthorized: 'Reconnect your wallet and approve access to continue.',
  unsupportedChain: 'Your wallet is on a network that is not supported.',
  insufficientFunds: 'Insufficient funds to complete this transaction.',
  default: 'Something went wrong with your wallet. Please try again.',
};

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
