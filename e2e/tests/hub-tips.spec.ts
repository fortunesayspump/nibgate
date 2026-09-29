import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { mintClaimToken } from '../../packages/nibgate/src/server/holding.js';

const HUB = 'http://localhost:3005';
const fixtures = JSON.parse(fs.readFileSync(path.resolve('e2e/.fixtures.json'), 'utf8'));
const CREATOR = fixtures.ownerWallet;

test('challenge resolves the fee-wallet payee with protocol fee', async ({ request }) => {
  const res = await request.post(`${HUB}/api/hub/tips/challenge`, {
    data: { contentUrl: 'https://shelflife.local/e2e-tip', title: 'E2E', amount: '0.25', recipient: CREATOR },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.payee).toMatch(/^0x[0-9a-fA-F]{40}$/);
  expect(body.payee.toLowerCase()).not.toBe(CREATOR);
  expect(body.feeBps).toBe(100);
  expect(body.protocolFee).toBeCloseTo(0.0025, 6);
  expect(res.headers()['ratelimit'] || res.headers()['ratelimit-limit']).toBeDefined();
});

test('challenge rejects bad input', async ({ request }) => {
  const res = await request.post(`${HUB}/api/hub/tips/challenge`, {
    data: { contentUrl: '', amount: '0' },
  });
  expect(res.status()).toBe(400);
});

test('hold returns a box-funded challenge; claim is gated', async ({ request }) => {
  const domain = `hube2e-${Date.now()}.example`;
  // No proof yet → a box-funding challenge (both rails pay the box).
  const hold = await request.post(`${HUB}/api/hub/tips/hold`, {
    data: { contentUrl: `https://${domain}/post`, title: 'Hold Me', amount: '0.2', domain, paymentRail: 'transfer' },
  });
  expect(hold.ok()).toBeTruthy();
  const holdBody = await hold.json();
  expect(holdBody.holdStatus).toBe('challenge');
  expect(holdBody.box).toMatch(/^0x[0-9a-fA-F]{40}$/);
  expect(holdBody.accepts[0].payTo).toBe(holdBody.box);

  const held = await request.get(`${HUB}/api/hub/tips/held?domain=${domain}`);
  expect(held.ok()).toBeTruthy();
  expect(Array.isArray((await held.json()).tips)).toBe(true);

  // Fresh verified owner for this domain, then claim gates + empty release.
  const verified = JSON.parse(
    execFileSync('node', ['e2e/verify-owner.mjs', domain, CREATOR], {
      cwd: path.resolve('.'),
      env: { ...process.env },
    }).toString(),
  );
  const bad = await request.post(`${HUB}/api/hub/tips/claim`, {
    data: { siteId: verified.siteId, token: 'wrong' },
  });
  expect(bad.status()).toBe(403);

  const claim = await request.post(`${HUB}/api/hub/tips/claim`, {
    data: { siteId: verified.siteId, token: verified.token },
  });
  expect(claim.ok()).toBeTruthy();
  const claimBody = await claim.json();
  expect(claimBody.released).toEqual([]);
  expect(claimBody.pending).toBe(0);
});

test('claim to a different wallet requires a valid wallet-control proof', async ({ request }) => {
  const domain = `hube2e-claim-${Date.now()}.example`;
  const verified = JSON.parse(
    execFileSync('node', ['e2e/verify-owner.mjs', domain, CREATOR], {
      cwd: path.resolve('.'),
      env: { ...process.env },
    }).toString(),
  );
  const other = privateKeyToAccount(generatePrivateKey());
  const sign = (m: string) => other.signMessage({ message: m });

  // Different wallet with no proof → 403 (owner-link bound wallet only).
  const noProof = await request.post(`${HUB}/api/hub/tips/claim`, {
    data: { siteId: verified.siteId, token: verified.token, creatorWallet: other.address },
  });
  expect(noProof.status()).toBe(403);

  // Expired proof → 403.
  const expired = await mintClaimToken({ domain, wallet: other.address, expiresAt: Date.now() - 1000 }, sign);
  const expiredRes = await request.post(`${HUB}/api/hub/tips/claim`, {
    data: { siteId: verified.siteId, token: verified.token, creatorWallet: other.address, claimToken: expired },
  });
  expect(expiredRes.status()).toBe(403);

  // Tampered signature → 403.
  const tampered = await mintClaimToken({ domain, wallet: other.address, expiresAt: Date.now() + 60000 }, sign);
  tampered.signature = `0x${'11'.repeat(65)}`;
  const tamperedRes = await request.post(`${HUB}/api/hub/tips/claim`, {
    data: { siteId: verified.siteId, token: verified.token, creatorWallet: other.address, claimToken: tampered },
  });
  expect(tamperedRes.status()).toBe(403);

  // Valid proof controlling `other` → accepted (empty release; no held tips).
  const valid = await mintClaimToken({ domain, wallet: other.address, expiresAt: Date.now() + 60000 }, sign);
  const ok = await request.post(`${HUB}/api/hub/tips/claim`, {
    data: { siteId: verified.siteId, token: verified.token, creatorWallet: other.address, claimToken: valid },
  });
  expect(ok.ok()).toBeTruthy();
  expect((await ok.json()).released).toEqual([]);
});

test('a second wallet cannot re-claim the same domain', async ({ request }) => {
  const domain = `hube2e-double-${Date.now()}.example`;
  const verified = JSON.parse(
    execFileSync('node', ['e2e/verify-owner.mjs', domain, CREATOR], {
      cwd: path.resolve('.'),
      env: { ...process.env },
    }).toString(),
  );
  const a = privateKeyToAccount(generatePrivateKey());
  const b = privateKeyToAccount(generatePrivateKey());
  const tokenFor = (acct: typeof a) =>
    mintClaimToken({ domain, wallet: acct.address, expiresAt: Date.now() + 60000 }, (m) => acct.signMessage({ message: m }));

  const first = await request.post(`${HUB}/api/hub/tips/claim`, {
    data: { siteId: verified.siteId, token: verified.token, creatorWallet: a.address, claimToken: await tokenFor(a) },
  });
  expect(first.ok()).toBeTruthy();

  const second = await request.post(`${HUB}/api/hub/tips/claim`, {
    data: { siteId: verified.siteId, token: verified.token, creatorWallet: b.address, claimToken: await tokenFor(b) },
  });
  expect(second.status()).toBe(409);
});

test('verify rejects bogus direct proof and challenges gateway', async ({ request }) => {
  const bad = await request.post(`${HUB}/api/hub/tips/verify`, {
    data: {
      contentUrl: 'https://shelflife.local/e2e-tip', amount: '0.1', recipient: CREATOR,
      paymentRail: 'transfer', txHash: '0x' + '00'.repeat(32), walletAddress: CREATOR,
    },
  });
  expect(bad.status()).toBe(402);

  const gw = await request.post(`${HUB}/api/hub/tips/verify`, {
    data: { contentUrl: 'https://shelflife.local/e2e-tip', amount: '0.1', recipient: CREATOR, paymentRail: 'gateway' },
  });
  expect(gw.status()).toBe(402);
});

test('tips list and resolve shapes', async ({ request }) => {
  const list = await request.get(`${HUB}/api/hub/tips?limit=5`);
  expect(list.ok()).toBeTruthy();
  const resolve = await request.get(`${HUB}/api/hub/resolve?url=https://shelflife.local/e2e-tip`);
  expect(resolve.ok()).toBeTruthy();
  const body = await resolve.json();
  expect(body.wallet).toBe(CREATOR);
  expect(body.source).toBe('hub-index');
});
