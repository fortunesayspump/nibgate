import { createGateway } from '@nibgate/internal/gateway.js';

export function createAppState(config, store) {
  const gateway = createGateway(config, store);

  return {
    site: {
      name: config.site.name,
      origin: config.site.origin,
      platformFeeBps: config.site.platformFeeBps
    },
    provider: {
      mode: gateway.paymentProvider.mode,
      displayName: gateway.paymentProvider.displayName,
      sellerAddress: gateway.paymentProvider.sellerAddress,
      networks: gateway.paymentProvider.networks,
      facilitatorUrl: gateway.paymentProvider.facilitatorUrl,
      buyerConfigured: gateway.paymentProvider.buyerConfigured,
      buyerChain: gateway.paymentProvider.buyerChain
    },
    hub: {
      apiBaseUrl: config.hub?.apiBaseUrl || '',
      siteId: config.hub?.siteId || '',
      verifyToken: config.hub?.verifyToken ? 'configured' : '',
      lastSyncAt: config.hub?.lastSyncAt || '',
      lastEventAt: config.hub?.lastEventAt || ''
    },
    routes: config.routes,
    payments: store.listPayments(),
    totals: {
      unlocks: store.listUnlocks().length,
      earnings: gateway.totalEarnings()
    }
  };
}
