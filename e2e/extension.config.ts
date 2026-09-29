import { defineConfig } from '@playwright/test';

// Extension E2E: loads the built extension (extension/dist) into a real
// Chromium and drives a fixture article page. No wallet signing in scope
// (no wallet pairing exists yet) — asserts injection, states, presets.
export default defineConfig({
  testDir: './tests',
  testMatch: /extension-.*\.spec\.ts/,
  timeout: 90000,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
