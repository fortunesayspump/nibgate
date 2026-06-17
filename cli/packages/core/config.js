import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliDir = path.resolve(__dirname, '..', '..');
const rootDir = path.resolve(cliDir, '..');

export function loadConfig() {
  const candidates = [
    process.env.NIBGATE_CONFIG,
    path.join(process.cwd(), 'nibgate.config.json'),
    path.join(cliDir, 'nibgate.config.json'),
    path.join(rootDir, 'nibgate.config.json')
  ].filter(Boolean);

  const configPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!configPath) {
    throw new Error('No nibgate.config.json found. Run `nibgate init` first.');
  }

  return {
    configPath,
    statePath: path.join(path.dirname(configPath), '.nibgate', 'state.json'),
    config: JSON.parse(fs.readFileSync(configPath, 'utf8'))
  };
}

export { rootDir };
