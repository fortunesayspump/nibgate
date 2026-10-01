import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.js'],
    setupFiles: ['./test/setup.js'],
    // The routes and the worker share one Prisma client and one set of rows.
    // Running files in parallel would have them trampling each other.
    fileParallelism: false,
  },
});