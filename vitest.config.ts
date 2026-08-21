import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vendored third-party reference code is not part of the workspace test
    // surface; its deps are not installed and its suites fail collection.
    exclude: [
      '**/node_modules/**',
      'revenue-model/references/**',
    ],
  },
});
