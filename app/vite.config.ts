import { defineConfig } from 'vite';
import webConfig from './web/vite.config';

export default defineConfig({
  ...webConfig,
  root: './web',
  build: {
    ...webConfig.build,
    outDir: '../dist',
    emptyOutDir: true
  }
});
