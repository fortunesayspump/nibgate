import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, 'index.html'),
        'unlock-client': path.resolve(__dirname, 'src/unlock-client.ts')
      },
      output: {
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === 'unlock-client') return 'assets/unlock-client.js';
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
