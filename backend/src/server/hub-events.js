import { emitEventToHub } from '@nibgate/internal/hub.js';

export function createHubEventForwarder(getConfig) {
  return async function forwardHubEvent(event) {
    const config = getConfig();
    if (!config.hub?.siteId || !config.hub?.siteToken) return;

    try {
      await emitEventToHub(config, event);
    } catch (error) {
      console.warn(`Nibgate hub event failed: ${error.message}`);
    }
  };
}

export function unlockEventPayloads(route, payment, actor, amount, extra = {}) {
  return [
    {
      type: 'payment_completed',
      resourceId: route.id,
      actor,
      value: amount,
      currency: route.currency,
      metadata: {
        routePath: route.path,
        paymentId: payment.id,
        ...extra
      }
    },
    {
      type: 'resource_unlock',
      resourceId: route.id,
      actor,
      value: amount,
      currency: route.currency,
      metadata: {
        routePath: route.path,
        paymentId: payment.id
      }
    }
  ];
}

export function viewEventPayload(route, actor = 'human') {
  return {
    type: 'resource_view',
    resourceId: route.id,
    actor,
    metadata: {
      routePath: route.path
    }
  };
}
