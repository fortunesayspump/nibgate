export const PAYMENT_RAILS = ['gateway', 'transfer'];

export function normalizePaymentRail(value, fallback = 'gateway') {
  const rail = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (rail === 'circle_gateway' || rail === 'x402') return 'gateway';
  if (rail === 'direct_transfer' || rail === 'wallet_transfer') return 'transfer';
  return PAYMENT_RAILS.includes(rail) ? rail : fallback;
}
