import path from 'node:path';
import { createApp } from '../server/server.js';
import { loadConfig, rootDir, withConfigDefaults } from 'nibgate/src/core/config.js';

let appPromise;

function loadServerConfig() {
  try {
    const { config, statePath } = loadConfig();
    return { config, statePath };
  } catch {
    return {
      statePath: path.join(rootDir, '.nibgate', 'state.json'),
      config: withConfigDefaults({
        site: {
          name: 'Nibgate',
          origin: process.env.NIBGATE_SITE_ORIGIN || 'https://nibgate.xyz'
        },
        payments: {
          mode: process.env.NIBGATE_PAYMENT_MODE || 'demo',
          sellerAddress: process.env.NIBGATE_SELLER_ADDRESS || '',
          facilitatorUrl: process.env.NIBGATE_FACILITATOR_URL || 'https://gateway-api-testnet.circle.com',
          networks: ['eip155:5042002']
        },
        routes: []
      })
    };
  }
}

function getApp() {
  if (!appPromise) {
    const { config, statePath } = loadServerConfig();
    appPromise = createApp(config, {
      statePath,
      loadLiveConfig: () => loadServerConfig().config
    });
  }

  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}

