import path from 'node:path';
import { loadConfig, withConfigDefaults } from '@nibgate/internal/config.js';
import { activeNetwork } from '@nibgate/internal/networks.js';

function fallbackStatePath() {
  return process.env.NIBGATE_STATE_PATH || path.join('/tmp', 'nibgate-state.json');
}

function environmentConfig() {
  // Chain + Circle endpoints follow NIBGATE_NETWORK (default testnet). Explicit
  // env vars always win — set them for canary overrides without flipping the
  // whole stack.
  const net = activeNetwork();
  const hosts = net.isTestnet
    ? { siteOrigin: 'https://testnet.nibgate.xyz' }
    : { siteOrigin: 'https://nibgate.xyz' };
  return {
    configPath: '',
    statePath: fallbackStatePath(),
    config: withConfigDefaults({
      site: {
        name: process.env.NIBGATE_SITE_NAME || 'Nibgate',
        origin: process.env.NIBGATE_SITE_ORIGIN || process.env.NIBGATE_HUB_PUBLIC_URL || hosts.siteOrigin,
        creatorWallet: process.env.NIBGATE_SELLER_ADDRESS || ''
      },
      payments: {
        mode: process.env.NIBGATE_PAYMENT_MODE || 'demo',
        sellerAddress: process.env.NIBGATE_SELLER_ADDRESS || '',
        facilitatorUrl: process.env.NIBGATE_FACILITATOR_URL || process.env.CIRCLE_GATEWAY_FACILITATOR_URL || net.facilitatorUrl,
        networks: [process.env.NIBGATE_PAYMENT_NETWORK || net.caip2]
      },
      hub: {
        apiBaseUrl: process.env.NIBGATE_HUB_URL || process.env.NIBGATE_SITE_ORIGIN || process.env.NIBGATE_HUB_PUBLIC_URL || hosts.siteOrigin,
        publicSiteUrl: process.env.NIBGATE_SITE_ORIGIN || process.env.NIBGATE_HUB_PUBLIC_URL || hosts.siteOrigin,
        siteId: '',
        siteToken: '',
        verifyToken: ''
      },
      routes: []
    })
  };
}

export function loadServerConfig() {
  if (process.env.NODE_ENV === 'production' && !process.env.NIBGATE_CONFIG) {
    return environmentConfig();
  }

  try {
    return loadConfig();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`${error.message} Falling back to environment-backed backend config.`);
    }

    return environmentConfig();
  }
}

export function createConfigResolver(config, loadLiveConfig) {
  return () => (loadLiveConfig ? loadLiveConfig() : config);
}
