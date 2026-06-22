import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        styles: path.resolve(__dirname, 'src/styles/styles.css')
      },
      output: {
        assetFileNames(assetInfo) {
          if (assetInfo?.name === 'styles.css') return 'assets/styles.css';
          return 'assets/[name]-[hash][extname]';
        },
        entryFileNames() {
          return 'assets/[name]-[hash].js';
        }
      }
    }
  }
});
