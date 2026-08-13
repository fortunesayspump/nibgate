// Seed a rich nibshare dataset for one owner so /share/mine + the share
// settings sheet show every state: free, paid, invite-only, draft, revoked,
// whitelists, viewers with counts, unlock receipts, and banned wallets.
//
// Run:  node scripts/seed-nibshare-demo.mjs   (from backend/)
// Idempotent: deletes the owner's existing nibshare rows first.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Load backend/.env manually (mirrors src/server/start.js) ----
try {
  const envPath = path.resolve(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const { registerProvider } = await import('@nibgate/sdk/server');
const { createNibgateProvider } = await import('../src/server/lib/nibgate-provider.js');
const { db } = await import('@nibgate/internal/db.js');
const service = await import('../src/server/nibshare/service.js');

const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error('R2 not configured in backend/.env — cannot create real encrypted bodies.');
  process.exit(1);
}
registerProvider('nibgate', createNibgateProvider, {
  endpoint: R2_ENDPOINT, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY,
  bucket: R2_BUCKET, publicUrl: R2_PUBLIC_URL.replace(/\/+$/, ''),
});

const OWNER = '0xd3c42d3f4342310440bc15ce43f524ed66b11905';
const alice = '0x1111111111111111111111111111111111111111';
const bob = '0x2222222222222222222222222222222222222222';
const carol = '0x3333333333333333333333333333333333333333';
const dave = '0x4444444444444444444444444444444444444444';
const eve = '0x5555555555555555555555555555555555555555';
const W = { alice, bob, carol, dave, eve };

let txSeq = 0;
const fakeTx = () => `0x${String(txSeq++).padStart(2, '0')}${'a'.repeat(62)}`;

async function createShare({ title, summary, contentType = 'article', price = '0', whitelist = [], whitelistPrice, publicAccess, status = 'active', content }) {
  const share = await service.createShare({
    title, summary, coverUrl: null, content, price, expiresAt: null, whitelist, whitelistPrice, publicAccess,
    storageProvider: 'nibgate', contentType, status, ownerWallet: OWNER,
  });
  return share;
}

async function unlock(share, wallet, at) {
  const amount = service.effectivePrice(share, wallet);
  if (Number(amount) === 0 && share.price > 0) {
    // whitelist-free tier = entitlement only (no receipt/count), matching runtime
    await service.grantEntitlement({ share, wallet });
    await db.nibShareEntitlement.update({
      where: { shareId_wallet: { shareId: share.id, wallet } },
      data: { grantedAt: new Date(at) },
    });
    return null;
  }
  const receipt = await service.grantUnlock({ share, payer: wallet, txHash: fakeTx(), amount });
  await db.nibShareReceipt.update({ where: { id: receipt.id }, data: { unlockedAt: new Date(at) } });
  await db.nibShareEntitlement.update({
    where: { shareId_wallet: { shareId: share.id, wallet } },
    data: { grantedAt: new Date(at) },
  });
  const ev = await db.nibShareEvent.findFirst({
    where: { shareId: share.id, type: 'view', wallet }, orderBy: { createdAt: 'desc' },
  });
  if (ev) await db.nibShareEvent.update({ where: { id: ev.id }, data: { createdAt: new Date(at) } });
  return receipt;
}

// Hard ban: revoke + never able to pay again. Refunds any paid receipt.
async function ban(share, wallet, at) {
  await service.banEntitlement({ share, wallet });
  await db.nibShareEntitlement.update({
    where: { shareId_wallet: { shareId: share.id, wallet } },
    data: { revokedAt: new Date(at) },
  });
  for (const type of ['ban', 'refund']) {
    const ev = await db.nibShareEvent.findFirst({
      where: { shareId: share.id, type, wallet }, orderBy: { createdAt: 'desc' },
    });
    if (ev) await db.nibShareEvent.update({ where: { id: ev.id }, data: { createdAt: new Date(at) } });
  }
}

// Soft revoke: loses current access, may re-pay to re-unlock. Refunds the last paid receipt.
async function revoke(share, wallet, at) {
  await service.revokeEntitlement({ share, wallet });
  await db.nibShareEntitlement.update({
    where: { shareId_wallet: { shareId: share.id, wallet } },
    data: { revokedAt: new Date(at) },
  });
  for (const type of ['revoke', 'refund']) {
    const ev = await db.nibShareEvent.findFirst({
      where: { shareId: share.id, type, wallet }, orderBy: { createdAt: 'desc' },
    });
    if (ev) await db.nibShareEvent.update({ where: { id: ev.id }, data: { createdAt: new Date(at) } });
  }
}

async function views(share, entries) {
  for (const { wallet, times } of entries) {
    for (const t of times) {
      await db.nibShareEvent.create({ data: { shareId: share.id, type: 'view', wallet, createdAt: new Date(t) } });
      await db.nibShare.update({ where: { id: share.id }, data: { viewCount: { increment: 1 } } });
    }
  }
}

// ---- Idempotent reset for this owner ----
await db.nibShareEvent.deleteMany({ where: { share: { ownerWallet: OWNER } } });
await db.nibShareReceipt.deleteMany({ where: { share: { ownerWallet: OWNER } } });
await db.nibShareEntitlement.deleteMany({ where: { share: { ownerWallet: OWNER } } });
await db.nibShare.deleteMany({ where: { ownerWallet: OWNER } });

const md = (body) => `# ${body.title}\n\n${body.intro}\n\n## What it is\n\n${body.what}\n\n## Why it matters\n\n${body.why}`;

// S1 — free, open
const s1 = await createShare({
  title: 'x402 for the Curious', summary: 'A plain-language tour of micropayment requests.',
  content: md({ title: 'x402 for the Curious', intro: 'A plain-language tour of x402: what a payment request is, how the challenge flows, and where USDC fits on Arc.',
    what: 'Every request is a self-describing envelope. The client signs it, the gateway verifies it, and the content unlocks.', why: 'Micropayments make per-article pricing viable — no subscriptions, no middleman.' }),
});

// S2 — free, invite-only (publicAccess=false: only listed wallets can view)
const s2 = await createShare({
  title: 'The Agent-Payment Tax', summary: 'Why autonomous agents overpay by default, and the fix.',
  whitelist: [W.alice, W.bob], publicAccess: false,
  content: md({ title: 'The Agent-Payment Tax', intro: 'Agents paying on autopilot is the new ad-fraud. This note sketches the fix.',
    what: 'Attach provenance to every payment: who instructed it, under what budget, with what cap.', why: 'Without it, agent payments get gamed the way ad impressions were.' }),
});

// S3 — paid, open
const s3 = await createShare({
  title: 'Pricing Creative Work in 2026', summary: 'A field-tested pricing ladder for digital work.',
  price: '1',
  content: md({ title: 'Pricing Creative Work in 2026', intro: 'Free tiers, paid tiers, and when to charge per-access vs per-license.',
    what: 'The ladder: loss-leader free posts, $0.50 impulse unlocks, $1 reference content, custom quotes for licensed reuse.', why: 'Per-access pricing is finally rational now that the rails cost pennies.' }),
});

// S4 — paid, invite-only (publicAccess=false)
const s4 = await createShare({
  title: 'Field Notes: Wallet UX', summary: 'Private notes on wallet connect flows that convert.',
  whitelist: [W.alice, W.dave], publicAccess: false,
  price: '0.5',
  content: md({ title: 'Field Notes: Wallet UX', intro: 'Private field notes on connect flows, sign-in fatigue, and the 4100 re-auth trap.',
    what: 'Every extra prompt loses ~30% of users. Re-request eth_requestAccounts before signing to avoid the 4100 dead-end.', why: 'Share only with a small circle — pricing experiments included.' }),
});

// S5 — draft
const s5 = await createShare({
  title: 'Scratchpad: Tokenomics', summary: 'Unpublished notes on token design.',
  status: 'draft',
  content: md({ title: 'Scratchpad: Tokenomics', intro: 'Rough notes — not ready to publish.',
    what: 'Supply curves, emissions schedules, and why most vesting cliffs are wrong.', why: 'Keep this private until it has a point.' }),
});

// S6 — free, open, then revoked
const s6 = await createShare({
  title: 'The Old Newsletter', summary: 'An early post, now closed.',
  content: md({ title: 'The Old Newsletter', intro: 'The first thing I published here. It has not aged well.',
    what: 'Notes on the 2025 attention economy that were wrong by mid-year.', why: 'Keeping the corpse around seemed worse than revoking it.' }),
});

// S7 — paid, public paid but whitelist is FREE (tiered pricing)
const s7 = await createShare({
  title: 'Private Beta: Gateway Patterns', summary: 'Public pays $1; early members unlock for free.',
  price: '1', whitelist: [W.alice, W.bob], whitelistPrice: '0',
  content: md({ title: 'Private Beta: Gateway Patterns', intro: 'Patterns we found building gateway v2 — early adopters get it free.',
    what: 'Pay-per-call models, credit top-ups, and the refund-shaped hole in x402.', why: 'A thank-you to the beta cohort: public pays, whitelist rides free.' }),
});

// S8 — paid, invite-only, whitelist gets a discount
const s8 = await createShare({
  title: 'Board Notes: The Nibgate Standard', summary: 'Invite-only. Whitelisted members pay $0.50; public cannot unlock.',
  price: '2', whitelist: [W.alice, W.dave], whitelistPrice: '0.5', publicAccess: false,
  content: md({ title: 'Board Notes: The Nibgate Standard', intro: 'Internal board notes on where the Nibgate standard goes next.',
    what: 'Multi-chain USDC rails, agent identity, and a reputation layer that outlives wallets.', why: 'Not for public consumption — invite-only, discounted for members.' }),
});

await db.nibShare.update({ where: { id: s1.id }, data: { createdAt: new Date('2026-08-06T10:00:00Z') } });
await db.nibShare.update({ where: { id: s2.id }, data: { createdAt: new Date('2026-08-07T09:00:00Z') } });
await db.nibShare.update({ where: { id: s3.id }, data: { createdAt: new Date('2026-08-08T08:00:00Z') } });
await db.nibShare.update({ where: { id: s4.id }, data: { createdAt: new Date('2026-08-09T07:00:00Z') } });
await db.nibShare.update({ where: { id: s5.id }, data: { createdAt: new Date('2026-08-10T06:00:00Z') } });
await db.nibShare.update({ where: { id: s6.id }, data: { createdAt: new Date('2026-08-01T12:00:00Z') } });
await db.nibShare.update({ where: { id: s7.id }, data: { createdAt: new Date('2026-08-11T08:00:00Z') } });
await db.nibShare.update({ where: { id: s8.id }, data: { createdAt: new Date('2026-08-11T18:00:00Z') } });

// Unlocks
await unlock(s3, W.alice, '2026-08-08T12:00:00Z');
await unlock(s3, W.bob, '2026-08-09T09:30:00Z');
await unlock(s3, W.carol, '2026-08-11T15:00:00Z');
await unlock(s4, W.alice, '2026-08-09T10:30:00Z');
await unlock(s4, W.dave, '2026-08-10T11:00:00Z');
await unlock(s7, W.alice, '2026-08-11T09:00:00Z'); // whitelist → free
await unlock(s7, W.bob, '2026-08-11T14:30:00Z'); // whitelist → free
await unlock(s8, W.alice, '2026-08-11T19:00:00Z'); // whitelist → $0.50
await unlock(s8, W.dave, '2026-08-12T08:00:00Z'); // whitelist → $0.50

// Bans (hard) and soft revokes
await ban(s2, W.eve, '2026-08-11T09:00:00Z'); // eve never paid — pure ban
await ban(s3, W.carol, '2026-08-11T16:30:00Z'); // carol paid $1, got banned → refunded
await revoke(s3, W.dave, '2026-08-12T09:00:00Z'); // dave never unlocked s3 but owner revokes anyway (soft)

// Views (deduped per wallet in the UI via access-control)
await views(s1, [
  { wallet: W.alice, times: ['2026-08-06T11:00:00Z', '2026-08-07T10:00:00Z', '2026-08-12T08:15:00Z'] },
  { wallet: W.bob, times: ['2026-08-06T14:00:00Z'] },
  { wallet: W.dave, times: ['2026-08-08T09:00:00Z'] },
  { wallet: null, times: ['2026-08-06T10:30:00Z', '2026-08-11T19:00:00Z'] },
]);
await views(s2, [
  { wallet: W.alice, times: ['2026-08-07T11:00:00Z', '2026-08-11T10:00:00Z'] },
  { wallet: W.bob, times: ['2026-08-07T13:00:00Z', '2026-08-12T09:00:00Z'] },
  { wallet: W.eve, times: ['2026-08-08T08:00:00Z', '2026-08-10T20:00:00Z'] },
  { wallet: null, times: ['2026-08-08T07:30:00Z'] },
]);
await views(s3, [
  { wallet: W.carol, times: ['2026-08-11T15:05:00Z'] },
  { wallet: W.dave, times: ['2026-08-10T13:00:00Z'] },
  { wallet: null, times: ['2026-08-08T12:30:00Z', '2026-08-09T10:00:00Z'] },
]);
await views(s4, [
  { wallet: W.alice, times: ['2026-08-09T10:45:00Z'] },
  { wallet: W.dave, times: ['2026-08-10T11:15:00Z'] },
  { wallet: null, times: ['2026-08-09T09:00:00Z'] },
]);
await views(s7, [
  { wallet: W.alice, times: ['2026-08-11T09:05:00Z'] },
  { wallet: W.bob, times: ['2026-08-11T14:35:00Z'] },
  { wallet: null, times: ['2026-08-11T08:10:00Z', '2026-08-11T18:00:00Z'] },
]);
await views(s8, [
  { wallet: W.alice, times: ['2026-08-11T19:05:00Z'] },
  { wallet: W.dave, times: ['2026-08-12T08:05:00Z'] },
]);
await views(s6, [
  { wallet: null, times: ['2026-08-01T12:30:00Z', '2026-08-02T10:00:00Z', '2026-08-03T11:00:00Z'] },
]);

// Revoke S6 (deletes its R2 body → public page 410s, stays in dashboard as revoked)
await service.revokeShare(s6);
const revEv = await db.nibShareEvent.findFirst({ where: { shareId: s6.id, type: 'revoke' }, orderBy: { createdAt: 'desc' } });
if (revEv) await db.nibShareEvent.update({ where: { id: revEv.id }, data: { createdAt: new Date('2026-08-04T12:00:00Z') } });

// ---- Summary ----
const shares = await db.nibShare.findMany({
  where: { ownerWallet: OWNER },
  include: {
    receipts: { orderBy: { unlockedAt: 'desc' } },
    entitlements: true,
    events: { orderBy: { createdAt: 'desc' } },
  },
  orderBy: { createdAt: 'desc' },
});

console.log(`\nSeeded ${shares.length} shares for ${OWNER}:\n`);
for (const s of shares) {
  const viewers = [...new Set(s.events.filter((e) => e.type === 'view' && e.wallet).map((e) => e.wallet))].length;
  const banned = s.entitlements.filter((e) => e.status === 'banned').length;
  const revoked = s.entitlements.filter((e) => e.status === 'revoked').length;
  const tier = s.whitelistPrice == null ? '' : ` wlPrice:${s.whitelistPrice}`;
  const gate = s.publicAccess ? '' : ' inviteOnly';
  console.log(
    `  /ns/${s.slug}  ${s.status.padEnd(7)} ${(s.price ? `$${s.price}` : 'free').padEnd(5)}` +
    ` whitelist:${s.whitelist.length}${tier}${gate}  unlocks:${s.unlockCount}  views:${s.viewCount}` +
    `  walletsSeen:${viewers}  banned:${banned}  revoked:${revoked}  receipts:${s.receipts.length}`
  );
}
console.log(`\nDone. Sign in at http://localhost:3001/share/mine with ${OWNER} to browse.`);
await db.$disconnect();
