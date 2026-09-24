export const PAYMENT_RAILS = ['gateway', 'transfer'];

export function normalizePaymentRail(value, fallback = 'gateway') {
  // Duplicate query params (?rail=transfer&rail=transfer) parse to an array —
  // take the first instead of falling back to gateway and misrouting the rail.
  const first = Array.isArray(value) ? value[0] : value;
  const rail = String(first || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (rail === 'circle_gateway' || rail === 'x402') return 'gateway';
  if (rail === 'direct_transfer' || rail === 'wallet_transfer') return 'transfer';
  return PAYMENT_RAILS.includes(rail) ? rail : fallback;
}
