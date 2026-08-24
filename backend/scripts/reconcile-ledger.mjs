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

// ── 1. One-to-one metric↔receipt assignment; surplus metrics are echoes ────
const SITE_OK = { deletedAt: null, isVerified: true, verificationStatus: 'verified' };
const [metrics, receipts] = await Promise.all([
  db.metric.findMany({ where: { eventName: 'unlock_completed', contentId: { not: null } } }),
  db.unlockReceipt.findMany({ where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: SITE_OK } } }),
]);

function ident(md) {
  return {
    tx: String(md.txHash || '').trim(),
    pid: String(md.paymentId || '').trim(),
    payer: String(md.payer || md._wallet || '').toLowerCase() || null,
    amount: Number.isFinite(Number(md.amount ?? md.revenue)) ? Number(md.amount ?? md.revenue) : null,
  };
}

const assignedMetricIds = new Set();
const unmatchedReceipts = [];
for (const r of receipts) {
  const t = new Date(r.createdAt).getTime();
  const candidates = metrics.filter((m) => {
    if (assignedMetricIds.has(m.id) || m.contentId !== r.contentId) return false;
    const k = ident(meta(m));
    const exact = (r.txHash && k.tx === r.txHash) || (r.paymentId && k.pid === String(r.paymentId));
    if (exact) return true;
    if (!k.payer || k.amount == null) return false;
    const mt = new Date(m.createdAt).getTime();
    return k.payer === String(r.payerWallet || '').toLowerCase()
      && Number(r.amount) === k.amount
      && Math.abs(mt - t) <= 5 * 60 * 1000;
  });
  // Prefer exact-id matches over fuzzy ones.
  candidates.sort((a, b) => {
    const ka = ident(meta(a)), kb = ident(meta(b));
    const ea = (r.txHash && ka.tx === r.txHash) || (r.paymentId && ka.pid === String(r.paymentId)) ? 0 : 1;
    const eb = (r.txHash && kb.tx === r.txHash) || (r.paymentId && kb.pid === String(r.paymentId)) ? 0 : 1;
    return ea - eb || new Date(a.createdAt) - new Date(b.createdAt);
  });
  if (candidates[0]) assignedMetricIds.add(candidates[0].id);
  else unmatchedReceipts.push(r);
}

let droppedEchoes = 0;
for (const m of metrics) {
  if (assignedMetricIds.has(m.id)) continue;
  const k = ident(meta(m));
  console.log(`${tag} drop echo/unmatched unlock metric ${m.id.slice(0, 8)} (${k.payer || 'no-payer'} ${k.amount ?? '?'} USDC @ ${m.createdAt.toISOString().slice(0, 16)})`);
  if (EXECUTE) await db.metric.delete({ where: { id: m.id } });
  droppedEchoes++;
}
console.log(`${tag} unlock metrics: ${metrics.length} checked against ${receipts.length} receipts, ${droppedEchoes} dropped, ${unmatchedReceipts.length} receipts had no metric`);

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
const [unlockMetrics, receiptCount, ratingCount] = await Promise.all([
  db.metric.count({ where: { eventName: 'unlock_completed', contentId: { not: null }, website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } }),
  db.unlockReceipt.count({ where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } } }),
  db.contentRating.count({ where: { status: 'accepted', proof: { startsWith: 'onchain:' }, website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } }),
]);
console.log(`${tag} counters now — Unlocks(metrics): ${unlockMetrics} | Payments(receipts): ${receiptCount} | Ratings: ${ratingCount}`);
process.exit(0);
