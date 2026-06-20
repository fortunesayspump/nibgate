import path from 'node:path';
import { loadConfig, rootDir, withConfigDefaults } from 'nibgate/src/core/config.js';
import { createGateway } from 'nibgate/src/core/gateway.js';
import { createStateStore } from 'nibgate/src/core/state.js';

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

export function loadAppState() {
  let config;
  let statePath;

  try {
    ({ config, statePath } = loadConfig());
  } catch {
    config = withConfigDefaults({
      site: {
        name: 'Nibgate',
        origin: process.env.NIBGATE_SITE_ORIGIN || 'https://nibgate.xyz'
      },
      payments: {
        mode: 'demo',
        sellerAddress: '',
        facilitatorUrl: 'https://gateway-api-testnet.circle.com',
        networks: ['eip155:5042002']
      },
      routes: []
    });
  }

  const store = createStateStore(statePath || path.join(rootDir, '.nibgate', 'state.json'));
  return createAppState(config, store);
}
