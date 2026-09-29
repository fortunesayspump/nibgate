import { defineConfig } from '@playwright/test';

const TIP_DB = 'postgresql://postgres:nibgate-tip-local@localhost:5433/nibgate_tip';

export default defineConfig({
  testDir: './tests',
  testIgnore: /extension-.*\.spec\.ts/,
  timeout: 60000,
  retries: 1,
  reporter: [['list']],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  globalSetup: './global-setup.ts',
  webServer: [
    {
      command: 'node src/server/start.js',
      cwd: '../backend',
      env: { ...process.env, PORT: '3005', DATABASE_URL: TIP_DB } as Record<string, string>,
      url: 'http://localhost:3005/api/hub/stats',
      timeout: 150000,
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev',
      cwd: '../subblogs/frontend',
      url: 'http://localhost:3002/e2e-tip',
      timeout: 240000,
      reuseExistingServer: true,
    },
  ],
});
