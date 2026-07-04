import { createApp } from '../server/server.js';
import { loadServerConfig } from '../server/runtime.js';

let appPromise;

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
