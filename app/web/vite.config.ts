import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        styles: path.resolve(__dirname, 'src/styles.css')
      },
      output: {
        assetFileNames(assetInfo) {
          if (assetInfo.name === 'styles.css') return 'assets/styles.css';
          return 'assets/[name]-[hash][extname]';
        },
        entryFileNames() {
          return 'assets/[name]-[hash].js';
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/.well-known': 'http://localhost:3000',
      '/demo': 'http://localhost:3000',
      '/protected': 'http://localhost:3000'
    }
  }
});
