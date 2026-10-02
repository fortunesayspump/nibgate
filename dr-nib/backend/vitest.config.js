import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.js'],
    setupFiles: ['./test/setup.js'],
    // The routes and the worker share one Prisma client and one set of rows.
    // Running files in parallel would have them trampling each other.
    fileParallelism: false,
    // Tests run against a real Postgres over the network (see test/setup.js),
    // so a draw loop of forty round trips is tens of seconds, not milliseconds.
    testTimeout: 180000,
  },
});