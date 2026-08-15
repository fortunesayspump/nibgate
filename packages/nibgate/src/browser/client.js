import { normalizeResource, normalizeContentType } from '../core/resource.js';
import { ratingMessage } from '../core/rating.js';
import { emit, flushQueue, payloadWithResource } from './events.js';
import { setDefaultClient } from './gate.js';
import { createGate } from './gate.js';
import { checkResourceAccess, payWithPaymentSignature, payAndUnlockResource } from './access.js';
import { createWalletCheckout } from './checkout.js';
import { createEvmGatewayUnlock, createHostedUnlock, createCircleGatewayBrowserAdapter } from './evm-gateway.js';
import { rateResource, createOnchainRating, mountRatingUI } from './rating-ui.js';
import { rateContentOnchain } from './reputation.js';
import { trackResourcePage, setupResourcePage } from './track.js';
import { createTransferCheckout, payWithTransfer } from './transfer.js';

export function createNibgate(defaults = {}) {
  const defaultResource = defaults.resource ? normalizeResource(defaults.resource) : null;

  function resourceWithDefaults(resource = {}) {
    return normalizeResource({
      ...(defaultResource || {}),
      ...(typeof resource === 'string' ? { id: resource } : resource)
    });
  }

  return {
    content(resource, extra = {}) {
      return emit('content_registered', payloadWithResource(resourceWithDefaults(resource), extra));
    },
    registerContent(resource, extra = {}) {
      return emit('content_registered', payloadWithResource(resourceWithDefaults(resource), extra));
    },
    view(resource, extra = {}) {
      return emit('resource_view', payloadWithResource(resourceWithDefaults(resource), extra));
    },
    track(eventName, payload = {}) {
      return emit(eventName || 'custom', payload);
    },
    unlockStarted(resource, extra = {}) {
      return emit('unlock_started', payloadWithResource(resourceWithDefaults(resource), extra));
    },
    unlockCompleted(resource, payment = {}) {
      return emit('unlock_completed', payloadWithResource(resourceWithDefaults(resource), payment));
    },
    paymentCompleted(resource, payment = {}) {
      return emit('payment_completed', payloadWithResource(resourceWithDefaults(resource), payment));
    },
    rateResource(resource, rating = {}, extra = {}) {
      return rateResource(resourceWithDefaults(resource), rating, extra);
    },
    ratingMessage(resource, rating = {}, messageOptions = {}) {
      return ratingMessage(resourceWithDefaults(resource), rating, messageOptions);
    },
    gate(resource, options = {}) {
      return createGate(resourceWithDefaults(resource), { ...options, client: this });
    },
    trackResourcePage(resource, options = {}) {
      return trackResourcePage(resourceWithDefaults(resource), options);
    },
    checkResourceAccess(resource, options = {}) {
      return checkResourceAccess(resourceWithDefaults(resource), options);
    },
    payWithPaymentSignature(resource, options = {}) {
      return payWithPaymentSignature(resourceWithDefaults(resource), options);
    },
    createWalletCheckout(resource, options = {}) {
      return createWalletCheckout(resourceWithDefaults(resource), options);
    },
    createCircleGatewayBrowserAdapter(options = {}) {
      return createCircleGatewayBrowserAdapter(options);
    },
    createTransferCheckout(resource, options = {}) {
      return createTransferCheckout(resourceWithDefaults(resource), options);
    },
    payWithTransfer(resource, options = {}) {
      return payWithTransfer(resourceWithDefaults(resource), options);
    },
    createEvmGatewayUnlock(resource, options = {}) {
      return createEvmGatewayUnlock(resourceWithDefaults(resource), options);
    },
    createHostedUnlock(resource, options = {}) {
      return createHostedUnlock(resourceWithDefaults(resource), options);
    },
    rateContentOnchain(resource, options = {}) {
      return rateContentOnchain(resourceWithDefaults(resource), options);
    },
    createOnchainRating(resource, options = {}) {
      return createOnchainRating(resourceWithDefaults(resource), options);
    },
    mountRatingUI(resource, options = {}) {
      return mountRatingUI(resourceWithDefaults(resource), options);
    },
    payAndUnlockResource(resource, options = {}) {
      return payAndUnlockResource(resourceWithDefaults(resource), options);
    },
    setupResourcePage(resource, options = {}) {
      return setupResourcePage(resourceWithDefaults(resource), options);
    },
    normalizeResource: resourceWithDefaults,
    normalizeContentType,
    flush: flushQueue
  };
}

export const nibgate = createNibgate();
setDefaultClient(nibgate);
