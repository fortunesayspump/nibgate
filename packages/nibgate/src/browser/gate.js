import { normalizeResource } from '../core/resource.js';
import { emit, payloadWithResource } from './events.js';
import { hasUnlock, markUnlocked } from './storage.js';

let defaultClient = null;

export function setDefaultClient(client) {
  defaultClient = client;
}

export function getDefaultClient() {
  return defaultClient;
}

export function createGate(resource, options = {}) {
  const normalized = normalizeResource(resource);
  const client = options.client || defaultClient;

  return {
    resource: normalized,
    content(extra = {}) {
      return client.content(normalized, extra);
    },
    view(extra = {}) {
      return client.view(normalized, extra);
    },
    track(eventName, payload = {}) {
      return client.track(eventName, payloadWithResource(normalized, payload));
    },
    unlockStarted(extra = {}) {
      return client.unlockStarted(normalized, extra);
    },
    unlockCompleted(payment = {}) {
      markUnlocked(normalized, payment);
      return client.unlockCompleted(normalized, payment);
    },
    paymentCompleted(payment = {}) {
      return client.paymentCompleted(normalized, payment);
    },
    isUnlocked() {
      return hasUnlock(normalized);
    },
    markUnlocked(payment = {}) {
      markUnlocked(normalized, payment);
      client.unlockCompleted(normalized, payment);
      client.paymentCompleted(normalized, payment);
      return true;
    },
    async unlock(handlerOrPayment = {}) {
      client.unlockStarted(normalized);
      const payment = typeof handlerOrPayment === 'function'
        ? await handlerOrPayment(normalized)
        : handlerOrPayment;
      markUnlocked(normalized, payment || {});
      client.unlockCompleted(normalized, payment || {});
      client.paymentCompleted(normalized, payment || {});
      return { unlocked: true, resource: normalized, payment: payment || {} };
    },
    rate(rating = {}, extra = {}) {
      return client.rateResource(normalized, rating, extra);
    }
  };
}
