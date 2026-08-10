#!/usr/bin/env node
/**
 * Nibshare live E2E using swarm wallets.
 *   1. Creator (CryptoAlice) signs in via SIWE (nonce + EIP-4361 signature) → session cookie.
 *   2. Creator creates a PAID share (price in USDC).
 *   3. Buyer (BlockchainBob) pays via Circle Gateway x402 (GET /access) → content + unlockProof.
 *   4. Proof replay: GET /access with x-nibgate-payment-proof → content, no re-charge.
 *   5. Creator lists /nibshare/mine → receipt shows buyer + tx.
 *   6. Best-effort: hub discovery must NOT index the share (nibshare is private).
 *
 * Env: HUB_URL (default http://localhost:3000), CREATOR, BUYER, PRICE.
 * Requires a local backend (pnpm --filter @nibgate/backend dev).
 */
import fs from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { GatewayClient } from '@circle-fin/x402-batching/client';

const HUB = process.env.HUB_URL || 'http://localhost:3000';
const RPC = 'https://rpc.testnet.arc.io';
const SWARM = '/Users/fortune/Documents/Workflows/nibgate-repo/swarm/swarm-wallets.json';
const wallets = JSON.parse(fs.readFileSync(SWARM, 'utf8'));
const byName = Object.fromEntries(wallets.map((w) => [w.name, w]));
const CREATOR = byName[process.env.CREATOR || 'CryptoAlice'];
const BUYER = byName[process.env.BUYER || 'BlockchainBob'];
const PRICE = process.env.PRICE || '1';

const jar = new Map();
function cookieHeader() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
function storeCookies(res) {
  const setCookies = res.headers.getSetCookie?.() ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  for (const c of setCookies) {
    const pair = c.split(';')[0];
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function api(path, opts = {}) {
  const res = await fetch(HUB + path, { ...opts, headers: { ...(opts.headers || {}), cookie: cookieHeader() } });
  storeCookies(res);
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const log = (...a) => console.log(...a);
const ok = (cond, msg) => log(cond ? `  ✓ ${msg}` : `  ✗ FAIL: ${msg}`);

// ── Step 1: creator signs in ───────────────────────────────────────────────
log(`\n== 1. Creator sign-in (${CREATOR.name} ${CREATOR.address}) ==`);
const nonce = await api('/auth/nonce');
if (nonce.status !== 200) throw new Error(`nonce failed: ${JSON.stringify(nonce.data)}`);
const creatorAccount = privateKeyToAccount(CREATOR.privateKey);
const message = createSiweMessage({
  address: creatorAccount.address,
  chainId: 5_042_002,
  domain: new URL(HUB).host,
  uri: HUB,
  nonce: nonce.data.nonce,
  version: '1',
  statement: 'Sign in to Nibgate to verify your wallet.',
  issuedAt: new Date(),
  expirationTime: new Date(Date.now() + 10 * 60 * 1000),
});
const signature = await creatorAccount.signMessage({ message });
const verify = await api('/auth/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message, signature }),
});
ok(verify.status === 200 && verify.data.success, `creator authenticated as ${verify.data.user?.walletAddress}`);
const me = await api('/auth/me');
ok(me.data?.authenticated, 'GET /auth/me returns authenticated');

// ── Step 2: create a paid share ────────────────────────────────────────────
log(`\n== 2. Create paid share (price $${PRICE}) ==`);
const before = await api('/hub/explore/content?q=');
const create = await api('/nibshare', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    title: `Nibshare E2E ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`,
    summary: 'swarm-wallet live test',
    content: `Hello from Nibshare E2E. This is behind a $${PRICE} USDC x402 gate.`,
    price: PRICE,
    contentType: 'text',
  }),
});
if (create.status !== 201) throw new Error(`create failed ${create.status}: ${JSON.stringify(create.data)}`);
const { slug, url, contentHash, ciphertextUrl } = create.data;
log(`  slug=${slug} url=${url} contentHash=${contentHash.slice(0, 12)}… ciphertextUrl=${ciphertextUrl}`);

const meta = await api(`/nibshare/${slug}/meta`);
ok(meta.data?.price === PRICE && meta.data?.status === 'active', `meta price=${meta.data?.price} status=${meta.data?.status}`);

// ── Step 3: buyer pays via x402 (GET /access) ──────────────────────────────
log(`\n== 3. Buyer pays $${PRICE} via Gateway x402 (${BUYER.name} ${BUYER.address}) ==`);
const buyer = new GatewayClient({ chain: 'arcTestnet', privateKey: BUYER.privateKey, rpcUrl: RPC });
const bal = await buyer.getBalances();
log(`  wallet USDC=${bal.wallet.formatted}  gateway available=${bal.gateway.formattedAvailable}`);
const priceMicros = BigInt(Math.round(parseFloat(PRICE) * 1_000_000));
if (bal.gateway.available < priceMicros + 1_000_000n) {
  const need = Number(priceMicros + 1_000_000n) / 1_000_000 + 1;
  log(`  depositing ${need.toFixed(2)} USDC to Gateway…`);
  const dep = await buyer.deposit(need.toFixed(2));
  log(`  deposit tx=${dep.depositTxHash}`);
}

const pay = await buyer.pay(`${HUB}/nibshare/${slug}/access`, {
  method: 'GET',
  headers: { accept: 'application/json', 'user-agent': 'nibshare-e2e/1.0' },
});
ok(pay.status === 200, `x402 payment settled (${pay.formattedAmount} USDC, tx=${pay.transaction})`);
const payData = pay.data;
ok(payData?.ok && payData.content?.includes('Nibshare E2E'), 'unlock response contains decrypted content');
ok(Boolean(payData?.unlockProof), `unlockProof minted: ${String(payData?.unlockProof).slice(0, 24)}…`);
ok(payData?.payment?.payerWallet?.toLowerCase() === buyer.address.toLowerCase(), `payer recorded = buyer`);

// ── Step 4: replay proof, no re-charge ─────────────────────────────────────
log(`\n== 4. Replay proof via /access ==`);
const replayRes = await fetch(`${HUB}/nibshare/${slug}/access`, {
  headers: { accept: 'application/json', 'x-nibgate-payment-proof': payData.unlockProof },
});
const replay = await replayRes.json();
ok(replayRes.status === 200 && replay.ok && replay.content?.includes('Nibshare E2E'), 'proof replay serves content without new payment');

// ── Step 5: creator sees the receipt ───────────────────────────────────────
log(`\n== 5. Creator receipts ==`);
const mine = await api('/nibshare/mine');
const shareRow = mine.data?.shares?.find((s) => s.slug === slug);
ok(Boolean(shareRow), `share listed in /mine (status=${shareRow?.status}, unlocks=${shareRow?.unlockCount})`);
const receipt = shareRow?.receipts?.[0];
ok(Boolean(receipt), `receipt exists`);
if (receipt) {
  ok(receipt.payerWallet?.toLowerCase() === buyer.address.toLowerCase(), `receipt.payerWallet = ${receipt.payerWallet}`);
  ok(receipt.txHash, `receipt.txHash = ${receipt.txHash}`);
  log(`  receipt: amount=${receipt.amount} ${receipt.currency} tx=${receipt.txHash}`);
}

// ── Step 6: hub must NOT index the share ───────────────────────────────────
log(`\n== 6. Hub discovery must not index the share (PRIVATE) ==`);
const after = await api('/hub/explore/content?q=');
const beforeCount = before.data?.total ?? -1;
const afterCount = after.data?.total ?? -1;
if (beforeCount >= 0 && afterCount >= 0) {
  ok(afterCount === beforeCount, `hub content count unchanged (${beforeCount} → ${afterCount})`);
} else {
  log(`  (skip: /hub/explore/content shape unknown: ${JSON.stringify(after.data).slice(0, 120)})`);
}
const qHit = await api(`/hub/explore/content?q=${encodeURIComponent(slug)}`);
ok(qHit.data?.total === 0, `share slug "${slug}" not findable in hub explore (total=0)`);

log(`\nDONE — share ${url}`);
