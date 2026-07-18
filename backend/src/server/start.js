import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createApp } from './server.js';
import { loadServerConfig } from './runtime.js';

const __filename = fileURLToPath(import.meta.url);

function runPrismaCommand() {
  try {
    const prismaCli = path.resolve(process.cwd(), 'node_modules/.bin/prisma');
    const schemaPath = path.resolve(process.cwd(), 'packages/cli/prisma/schema.prisma');
    if (require) {}
    execSync(`node ${prismaCli} generate --schema=${schemaPath} 2>&1`, { stdio: 'pipe', timeout: 30000 });
    execSync(`node ${prismaCli} db push --schema=${schemaPath} --skip-generate --accept-data-loss 2>&1`, { stdio: 'pipe', timeout: 30000 });
    console.log('[nibgate] Prisma client generated and schema synced');
  } catch (error) {
    console.warn('[nibgate] Prisma setup skipped:', error.message?.split('\n')[0] || '');
  }
}

export function startAppServer() {
  runPrismaCommand();
  const { config, statePath } = loadServerConfig();
  const port = Number(process.env.PORT || 3000);

  return createApp(config, { statePath, loadLiveConfig: () => loadServerConfig().config }).then((app) => app.listen(port, () => {
    console.log(`[nibgate] Backend running on port ${port}`);
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startAppServer();
}
