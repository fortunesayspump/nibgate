import fs from 'node:fs';
import path from 'node:path';
import { rootDir } from '@nibgate/cli/src/core/config.js';


export function createConfigResolver(config, loadLiveConfig) {
  return () => (loadLiveConfig ? loadLiveConfig() : config);
}
