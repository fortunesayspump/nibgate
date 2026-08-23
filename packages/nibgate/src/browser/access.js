import { normalizeResource } from '../core/resource.js';
import { browserWindow } from './env.js';
import { emit } from './events.js';
import { getPaymentProof, storePaymentProof } from './storage.js';
import { stringifyJson } from './json.js';
import { createGate } from './gate.js';
import { trackResourcePage } from './track.js';

export async function checkResourceAccess(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const accessPath = options.accessPath || item.resource.accessPath || '/api/nibgate/access';
  const status = typeof options.onStatus === 'function' ? options.onStatus : () => {};

  status(options.checkingMessage || 'Checking access route...');
  item.unlockStarted({ source: options.source, paymentProvider: options.paymentProvider || 'nibgate-access-route' });

  const response = await fetch(accessPath, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      ...(getPaymentProof(item.resource) ? { 'x-nibgate-payment-proof': getPaymentProof(item.resource) } : {}),
      ...(options.headers || {})
    },
    body: options.body
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 402) {
    item.track('payment_challenge_returned', { source: options.source, challenge: payload, resource: item.resource });
    status(options.challengeMessage || 'Payment challenge returned. Continue with checkout.');
    // Pre-checkout ownership probe: the server hinted (ownedForClaim) that the
    // claimed wallet already has a paid receipt for this resource. Ask the
    // user for ONE ownership signature and retry — if possession verifies,
    // the lifetime path re-issues access for free instead of charging again.
    if (payload?.ownedForClaim && typeof options.proveOwnership === 'function') {
      try {
        status(options.ownershipMessage || 'Confirming you already own this...');
        const proof = await options.proveOwnership({ resource: item.resource, challenge: payload });
        if (proof && proof.signature) {
          const probeResponse = await fetch(accessPath, {
            method: options.method || 'GET',
            headers: {
              accept: 'application/json',
              [options.ownershipSignatureHeader || 'x-nibgate-ownership-signature']: proof.signature,
              ...(options.headers || {})
            },
            body: options.body
          });
          const probePayload = await probeResponse.json().catch(() => ({}));
          if (probeResponse.ok && probePayload?.ok) {
            try { storePaymentProof(item.resource, probePayload.unlockProof); } catch (_error) {}
            const probePayment = options.payment || probePayload.payment || null;
            if (probePayment) {
              item.unlockCompleted(probePayment);
              item.paymentCompleted(probePayment);
            }
            emit('unlock', { resource: item.resource, payment: probePayment, via: 'ownership-proof' });
            status(options.successMessage || 'Access allowed and Nibgate events emitted.');
            return { ok: true, status: probeResponse.status, payload: probePayload, payment: probePayment, resource: item.resource, response: probeResponse };
          }
        }
      } catch (_probeError) {
        // Signature rejected / user cancelled — fall through to normal payment.
      }
    }
    if (typeof options.createPaymentSignature === 'function' || typeof options.checkout === 'function') {
      return payWithPaymentSignature(resource, {
        ...options, challenge: payload,
        paymentRequiredHeader: response.headers.get('PAYMENT-REQUIRED') || response.headers.get('payment-required') || ''
      });
    }
    if (options.autoPay && options.payPath) {
      const paymentResult = await payAndUnlockResource(resource, options);
      if (paymentResult.ok && options.retryAfterPay !== false) {
        return checkResourceAccess(resource, { ...options, autoPay: false });
      }
      return paymentResult;
    }
    return { ok: false, status: response.status, challenge: payload, resource: item.resource, response };
  }

  if (!response.ok) {
    status(payload.error || options.errorMessage || 'Access check failed');
    return { ok: false, status: response.status, error: payload.error || 'Access check failed', payload, resource: item.resource, response };
  }

  const payment = options.payment || payload.payment || null;
  if (payment) {
    item.unlockCompleted(payment);
    item.paymentCompleted(payment);
  }
  status(options.successMessage || 'Access allowed and Nibgate events emitted.');
  return { ok: true, status: response.status, payload, payment, resource: item.resource, response };
}

export async function payWithPaymentSignature(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const accessPath = options.accessPath || item.resource.accessPath || '/api/nibgate/access';
  const status = typeof options.onStatus === 'function' ? options.onStatus : () => {};

  status(options.paymentMessage || 'Waiting for wallet payment approval...');
  item.unlockStarted({ source: options.source, paymentProvider: options.paymentProvider || 'wallet-gateway' });

  let paymentSignature = options.paymentSignature || '';
  let paymentMemo = options.memo || '';
  let paymentMetadata = options.payment || {};

  if (!paymentSignature) {
    const paymentRequiredHeader = options.paymentRequiredHeader || '';
    const challenge = options.challenge || null;
    const checkout = options.createPaymentSignature || options.checkout;
    const result = await checkout({
      resource: item.resource, challenge, paymentRequiredHeader, accessPath
    });
    if (result?.self) {
      const payment = { paymentProvider: 'self', self: true, payer: result.address, amount: 0, revenue: 0, currency: item.resource.currency || 'USDC' };
      item.markUnlocked(payment);
      status(options.selfPayMessage || 'This is your content — no payment needed.');
      return { ok: true, status: 200, self: true, payment, resource: item.resource };
    }
    paymentSignature = result?.paymentSignature || result?.signature || result?.payment || '';
    paymentMemo = result?.memo || result?.paymentMemo || '';
    paymentMetadata = result?.metadata || result?.paymentMetadata || result || {};
  }

  if (!paymentSignature) {
    const error = 'Wallet did not return a payment signature.';
    item.track('payment_failed', { source: options.source, error });
    status(error);
    return { ok: false, status: 400, error, resource: item.resource };
  }

  const response = await fetch(accessPath, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      'payment-signature': paymentSignature,
      ...(paymentMemo ? { 'payment-memo': paymentMemo } : {}),
      ...(options.headers || {})
    }
  });
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch (_error) {
    payload = { error: responseText || 'Payment verification failed' };
  }

  if (!response.ok) {
    const detail = payload.detail || payload.reason || payload.invalidReason || payload.error || responseText || 'Payment verification failed';
    const error = typeof detail === 'string' ? detail : stringifyJson(detail);
    item.track('payment_failed', { source: options.source, status: response.status, error, ...paymentMetadata });
    status(options.paymentErrorMessage || error);
    return { ok: false, status: response.status, error, payload, resource: item.resource, response };
  }

  const payment = payload.payment || {
    paymentProvider: options.paymentProvider || 'wallet-gateway',
    paymentId: paymentSignature,
    memo: paymentMemo,
    amount: Number(item.resource.price || 0),
    revenue: Number(item.resource.price || 0),
    currency: item.resource.currency || 'USDC',
    ...paymentMetadata
  };
  storePaymentProof(item.resource, payload.unlockProof);
  item.markUnlocked(payment);
  status(options.paymentSuccessMessage || 'Payment verified. Content unlocked.');
  return { ok: true, status: response.status, payload, payment, resource: item.resource, response };
}

export async function payAndUnlockResource(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const payPath = options.payPath || item.resource.payPath || '/api/nibgate/pay';
  const status = typeof options.onStatus === 'function' ? options.onStatus : () => {};

  status(options.paymentMessage || 'Starting payment...');
  item.unlockStarted({ source: options.source, paymentProvider: options.paymentProvider || 'circle-gateway' });

  const response = await fetch(payPath, {
    method: options.payMethod || 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options.payHeaders || {})
    },
    body: JSON.stringify({ resource: item.resource, ...(options.payPayload || {}) })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.ok) {
    item.track('payment_failed', { source: options.source, status: response.status, error: payload.error || 'Payment failed', detail: payload.detail || '' });
    status(payload.detail || payload.error || options.paymentErrorMessage || 'Payment failed.');
    return { ok: false, status: response.status, payload, resource: item.resource, response };
  }

  const payment = payload.payment || {
    paymentProvider: options.paymentProvider || 'circle-gateway',
    paymentId: payload.paymentId || `nibgate_payment_${Date.now()}`,
    amount: Number(item.resource.price || 0),
    revenue: Number(item.resource.price || 0),
    currency: item.resource.currency || 'USDC'
  };
  storePaymentProof(item.resource, payload.unlockProof);
  item.markUnlocked(payment);
  status(options.paymentSuccessMessage || 'Payment verified. Content unlocked.');
  return { ok: true, status: response.status, payload, payment, resource: item.resource, response };
}
