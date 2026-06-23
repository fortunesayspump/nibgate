import fs from 'node:fs';
import path from 'node:path';
import { rootDir } from 'nibgate/src/core/config.js';

export function resolveAppDist() {
  return path.join(rootDir, 'frontend', 'public');
}

export function resolveWebAssets(distDir) {
  return {
    cssHref: '/test.css'
  };
}

export function createConfigResolver(config, loadLiveConfig) {
  return () => (loadLiveConfig ? loadLiveConfig() : config);
}
