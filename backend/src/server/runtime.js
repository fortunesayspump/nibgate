import path from 'node:path';
import { loadConfig, withConfigDefaults } from '@nibgate/cli/src/core/config.js';

function fallbackStatePath() {
  return process.env.NIBGATE_STATE_PATH || path.join('/tmp', 'nibgate-state.json');
}

function environmentConfig() {
  return {
    configPath: '',
    statePath: fallbackStatePath(),
    config: withConfigDefaults({
      site: {
        name: process.env.NIBGATE_SITE_NAME || 'Nibgate',
        origin: process.env.NIBGATE_SITE_ORIGIN || process.env.NIBGATE_HUB_PUBLIC_URL || 'https://nibgate.xyz',
        creatorWallet: process.env.NIBGATE_SELLER_ADDRESS || ''
      },
      payments: {
        mode: process.env.NIBGATE_PAYMENT_MODE || 'demo',
        sellerAddress: process.env.NIBGATE_SELLER_ADDRESS || '',
        facilitatorUrl: process.env.NIBGATE_FACILITATOR_URL || process.env.CIRCLE_GATEWAY_FACILITATOR_URL || 'https://gateway-api-testnet.circle.com',
        networks: [process.env.NIBGATE_PAYMENT_NETWORK || 'eip155:5042002']
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
