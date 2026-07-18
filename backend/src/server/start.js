import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createApp } from './server.js';
import { loadServerConfig } from './runtime.js';

const __filename = fileURLToPath(import.meta.url);

async function migrateSchema() {
  const prismaCli = path.resolve(process.cwd(), 'node_modules/.bin/prisma');
  const schemaPath = path.resolve(process.cwd(), 'packages/cli/prisma/schema.prisma');
  try {
    execSync(`node ${prismaCli} db push --schema=${schemaPath} --skip-generate --accept-data-loss 2>&1`, { stdio: 'pipe' });
    console.log('[nibgate] Schema synced');
  } catch (error) {
    console.warn('[nibgate] Schema sync skipped:', error.message?.split('\n')[0] || 'unknown error');
  }
}

export async function startAppServer() {
  await migrateSchema();
  const { config, statePath } = loadServerConfig();
  const port = Number(process.env.PORT || 3000);

  return createApp(config, { statePath, loadLiveConfig: () => loadServerConfig().config }).then((app) => app.listen(port, () => {
    console.log(`[nibgate] Backend running on port ${port}`);
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startAppServer();
}
