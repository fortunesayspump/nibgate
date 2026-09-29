import { defineConfig } from '@playwright/test';

// CI config: runs only the non-funded hub API suite (hub-tips.spec.ts) against
// a local hub + Postgres. No browser extension, no funds, no subblogs FE.
const TIP_DB = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nibgate_tip';

export default defineConfig({
  testDir: './tests',
  testMatch: /hub-tips\.spec\.ts/,
  timeout: 60000,
  retries: 1,
  reporter: [['list']],
  use: {
    screenshot: 'only-on-failure',
  },
  globalSetup: './global-setup.ts',
  webServer: [
    {
      command: 'node src/server/start.js',
      cwd: '../backend',
      env: { ...process.env, PORT: '3005', DATABASE_URL: TIP_DB } as Record<string, string>,
      url: 'http://localhost:3005/api/hub/stats',
      timeout: 180000,
      reuseExistingServer: false,
    },
  ],
});
