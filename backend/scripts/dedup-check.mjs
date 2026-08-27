import { db } from '@nibgate/internal/db.js';
const rows = await db.unlockReceipt.findMany({
  where: { status: 'verified', content: { website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } },
  select: { id: true, contentId: true, paymentProvider: true, txHash: true, paymentId: true, amount: true, createdAt: true },
});
const byContent = new Map();
for (const r of rows) {
  if (!byContent.has(r.contentId)) byContent.set(r.contentId, []);
  byContent.get(r.contentId).push(r);
}
let directDups=0;
for (const [cid, arr] of byContent) {
  if (arr.length < 2) continue;
  const direct = arr.filter(r=>String(r.paymentProvider||'').toLowerCase().includes('direct'));
  if (direct.length >= 2) {
    directDups++;
    const txs = direct.map(r=>r.txHash.slice(0,10));
    const amts = direct.map(r=>r.amount);
    console.log(`content ${cid.slice(0,8)} has ${direct.length} DIRECT receipts amts=[${amts}] txs=[${txs}]`);
  }
}
console.log('\ncontents with duplicate direct receipts:', directDups);
process.exit(0);
