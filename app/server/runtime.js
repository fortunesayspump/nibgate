import fs from 'node:fs';
import path from 'node:path';
import { rootDir } from '../../cli/packages/core/config.js';

export function resolveAppDist() {
  const preferredDist = path.join(rootDir, 'app', 'dist');
  if (fs.existsSync(path.join(preferredDist, 'index.html'))) {
    return preferredDist;
  }

  return path.join(rootDir, 'app', 'web', 'dist');
}

export function resolveWebAssets(distDir) {
  if (process.env.NIBGATE_PANEL_DEV === 'true') {
    return {
      cssHref: 'http://localhost:5173/src/styles.css'
    };
  }

  try {
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const cssMatch = html.match(/href="([^"]+\.css)"/);
    return {
      cssHref: cssMatch ? cssMatch[1] : '/assets/styles.css'
    };
  } catch {
    return {
      cssHref: '/assets/styles.css'
    };
  }
}

export function createConfigResolver(config, loadLiveConfig) {
  return () => (loadLiveConfig ? loadLiveConfig() : config);
}
