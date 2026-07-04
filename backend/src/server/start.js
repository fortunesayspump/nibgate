import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server.js';
import { loadServerConfig } from './runtime.js';

const __filename = fileURLToPath(import.meta.url);

export function startAppServer() {
  const { config, statePath } = loadServerConfig();
  const port = Number(process.env.PORT || 3000);

  return createApp(config, { statePath, loadLiveConfig: () => loadServerConfig().config }).then((app) => app.listen(port, () => {
    console.log(`Nibgate app running at http://localhost:${port}`);
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startAppServer();
}
