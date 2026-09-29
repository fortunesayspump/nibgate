import { test, expect } from '@playwright/test';

// Visual: tip surfaces render (funded card + site-fetching card states).
// Wallet signing is intentionally out of scope (needs a browser wallet);
// the paid path is covered by hub-tips.spec.ts + SDK vitest.
test('tip cards render presets, custom input, and states', async ({ page }) => {
  await page.goto('http://localhost:3002/e2e-tip');
  await expect(page.getByRole('heading', { name: 'E2E Tip Harness' })).toBeVisible();

  const funded = page.getByTestId('tip-card-funded');
  await expect(funded.getByRole('button', { name: 'Tip $0.25' })).toBeVisible();
  await expect(funded.getByRole('button', { name: 'Tip $1' })).toBeVisible();
  await expect(funded.getByRole('button', { name: 'Tip $5' })).toBeVisible();
  await expect(funded.getByLabel('Custom tip amount in USDC')).toBeVisible();
  await expect(funded.getByText('Tip the creator')).toBeVisible();

  const site = page.getByTestId('tip-card-site');
  await expect(site.getByText("hasn't set a payout wallet yet")).toBeVisible();

  await page.screenshot({ path: 'e2e/screenshots/tip-cards.png' });
});
