import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createApp } from './server.js';
import { loadServerConfig } from './runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env manually
try {
  const envPath = path.resolve(__dirname, '../../.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch {} // .env is optional

function runPrismaCommand() {
  try {
    const repoRoot = path.resolve(__dirname, '../../..');
    const prismaCli = path.resolve(repoRoot, 'packages/cli/node_modules/.bin/prisma');
    const schemaPath = path.resolve(repoRoot, 'packages/cli/prisma/schema.prisma');
    execSync(`"${prismaCli}" generate --schema=${schemaPath} 2>&1`, { stdio: 'pipe', timeout: 30000 });
    execSync(`"${prismaCli}" db push --schema=${schemaPath} --skip-generate --accept-data-loss 2>&1`, { stdio: 'pipe', timeout: 30000 });
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
