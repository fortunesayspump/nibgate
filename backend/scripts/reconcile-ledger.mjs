// One-off: reconcile ledger counters after the api-origin cleanup.
//
//   node scripts/reconcile-ledger.mjs            # dry run
//   node scripts/reconcile-ledger.mjs --execute  # apply
//
// 1) Echo unlock metrics whose settlement receipt no longer exists are
//    deleted (keeps Unlocks == Payments).
// 2) ContentRating rows lost when shadow content rows were deleted are
//    rebuilt from their surviving rating metrics (same txHash proof).
import { db } from '@nibgate/internal/db.js';

const EXECUTE = process.argv.includes('--execute');
const tag = EXECUTE ? '[exec]' : '[dry]';

function meta(m) {
  try { return typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata || {}; } catch { return {}; }
}

// ── 1. Drop unlock/payment echoes with no matching verified receipt ────────
const echoes = await db.metric.findMany({
  where: { eventName: 'unlock_completed', contentId: { not: null } },
});
let droppedEchoes = 0, kept = 0;
for (const m of echoes) {
  const md = meta(m);
  const payer = String(md.payer || md._wallet || '').toLowerCase() || null;
  const amount = Number(md.amount ?? md.revenue ?? NaN);
  const t = new Date(m.createdAt).getTime();
  let match = null;
  if (md.txHash) {
    match = await db.unlockReceipt.findFirst({ where: { contentId: m.contentId, status: 'verified', OR: [{ paymentId: String(md.txHash) }, { txHash: String(md.txHash) }] } });
  }
  if (!match && payer && Number.isFinite(amount)) {
    match = await db.unlockReceipt.findFirst({
      where: {
        contentId: m.contentId, status: 'verified', payerWallet: payer, amount,
        createdAt: { gte: new Date(t - 5 * 60 * 1000), lte: new Date(t + 5 * 60 * 1000) },
      },
    });
  }
  if (!match && !payer && !md.txHash) {
    // No identity at all — keep it; cannot prove it is an echo.
    kept++;
    continue;
  }
  if (!match) {
    console.log(`${tag} drop echo unlock metric ${m.id.slice(0, 8)} (${payer || 'no-payer'} ${Number.isFinite(amount) ? amount : '?'} USDC @ ${m.createdAt.toISOString().slice(0, 16)})`);
    if (EXECUTE) await db.metric.delete({ where: { id: m.id } });
    droppedEchoes++;
  } else kept++;
}
console.log(`${tag} unlock metrics: ${echoes.length} checked, ${droppedEchoes} echoes dropped, ${kept} matched receipts`);

// ── 2. Rebuild ContentRating rows from rating metrics ──────────────────────
const ratingMetrics = await db.metric.findMany({
  where: { type: 'rating', contentId: { not: null }, eventName: 'content_rating' },
});
let rebuilt = 0, existed = 0, skippedNoProof = 0;
for (const m of ratingMetrics) {
  const md = meta(m);
  const wallet = String(md.walletAddress || md.payer || md._wallet || '').toLowerCase();
  const tx = String(md.txHash || '').trim();
  const value = Number.parseInt(String(md.ratingValue ?? ''), 10);
  const content = await db.content.findUnique({ where: { id: m.contentId }, select: { id: true, websiteId: true } });
  if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet) || !tx || !Number.isFinite(value) || !content) { skippedNoProof++; continue; }
  const existing = await db.contentRating.findFirst({ where: { contentId: m.contentId, walletAddress: wallet } });
  if (existing) { existed++; continue; }
  console.log(`${tag} rebuild rating ${wallet.slice(0, 10)} -> ${m.contentId.slice(0, 8)} value=${value} tx=${tx.slice(0, 10)}`);
  if (EXECUTE) {
    await db.contentRating.create({
      data: {
        contentId: m.contentId,
        websiteId: content.websiteId,
        walletAddress: wallet,
        ratingValue: Math.max(1, Math.min(50, value)),
        txHash: tx,
        proofType: 'onchain',
        proof: `onchain:${tx}`,
        status: 'accepted',
        metadata: m.metadata ? m.metadata.slice(0, 5000) : null,
        createdAt: m.createdAt,
      },
    });
  }
  rebuilt++;
}
console.log(`${tag} ratings: ${rebuilt} rebuilt, ${existed} already present, ${skippedNoProof} unusable`);

// ── 3. Final counters ───────────────────────────────────────────────────────
const [unlockMetrics, receipts, ratings] = await Promise.all([
  db.metric.count({ where: { eventName: 'unlock_completed', contentId: { not: null }, website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } }),
  db.unlockReceipt.count({ where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } } }),
  db.contentRating.count({ where: { status: 'accepted', proof: { startsWith: 'onchain:' }, website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } }),
]);
console.log(`${tag} counters now — Unlocks(metrics): ${unlockMetrics} | Payments(receipts): ${receipts} | Ratings: ${ratings}`);
process.exit(0);
