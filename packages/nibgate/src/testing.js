import { emitHubEvent, normalizeResource } from './server.js';

export async function emitTestEvents(resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const payment = {
    paymentProvider: options.paymentProvider || 'nibgate-package-test',
    paymentId: options.paymentId || `nibgate_test_${Date.now()}`,
    amount: Number(resource.price || 0),
    revenue: Number(resource.price || 0),
    currency: resource.currency || 'USDC',
    ...(options.payment || {})
  };
  const shared = {
    ...options,
    payload: {
      source: options.source || 'nibgate-package-test',
      ...(options.payload || {})
    }
  };

  const events = [];
  events.push(await emitHubEvent('content_registered', resource, shared));
  events.push(await emitHubEvent('resource_view', resource, shared));
  events.push(await emitHubEvent('unlock_started', resource, {
    ...shared,
    payload: { ...(shared.payload || {}), paymentProvider: payment.paymentProvider }
  }));
  events.push(await emitHubEvent('payment_completed', resource, {
    ...shared,
    payload: { ...(shared.payload || {}), ...payment }
  }));
  events.push(await emitHubEvent('unlock_completed', resource, {
    ...shared,
    payload: { ...(shared.payload || {}), ...payment }
  }));

  if (options.rating && (options.ratingSignature || options.signature || options.txHash)) {
    events.push(await emitHubEvent('content_rating', resource, {
      ...shared,
      payload: {
        ...(shared.payload || {}),
        ...payment,
        walletAddress: options.walletAddress || options.payer || payment.payer || '',
        rating: options.rating || 4.5,
        ratingMessage: options.ratingMessage || '',
        ratingSignature: options.ratingSignature || options.signature || '',
        reviewHash: options.reviewHash || '',
        txHash: options.txHash || '',
        proofType: options.proofType || (options.txHash ? 'onchain_pending' : 'signed'),
        proof: options.proof || payment.paymentId
      }
    }));
  }

  return { success: true, events, payment };
}
