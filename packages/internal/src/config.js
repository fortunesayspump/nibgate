import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliDir = path.resolve(__dirname, '..', '..');
const rootDir = path.resolve(cliDir, '..', '..');

function configCandidates() {
  return [
    process.env.NIBGATE_CONFIG,
    path.join(process.cwd(), 'nibgate.config.json'),
    path.join(cliDir, 'nibgate.config.json'),
    path.join(rootDir, 'nibgate.config.json')
  ].filter(Boolean);
}

function defaultHubConfig(site = {}) {
  return {
    apiBaseUrl: process.env.NIBGATE_HUB_URL || 'http://localhost:3000',
    siteId: '',
    siteToken: '',
    verifyToken: '',
    publicSiteUrl: site.origin || '',
    lastSyncAt: '',
    lastEventAt: ''
  };
}

export function withConfigDefaults(config) {
  return {
    ...config,
    site: {
      platformFeeBps: 100,
      ...config.site
    },
    hub: {
      ...defaultHubConfig(config.site),
      ...(config.hub || {})
    }
  };
}

export function resolveConfigPath() {
  const configPath = configCandidates().find((candidate) => fs.existsSync(candidate));
  if (!configPath) {
    throw new Error('No nibgate.config.json found. Run `nibgate init` first.');
  }

  return configPath;
}

export function loadConfig() {
  const configPath = resolveConfigPath();

  return {
    configPath,
    statePath: path.join(path.dirname(configPath), '.nibgate', 'state.json'),
    config: withConfigDefaults(JSON.parse(fs.readFileSync(configPath, 'utf8')))
  };
}

export function writeConfig(configPath, config) {
  fs.writeFileSync(configPath, `${JSON.stringify(withConfigDefaults(config), null, 2)}\n`);
}

export { rootDir };
