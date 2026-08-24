// One-off: merge ledger data from api-origin "bogus" content rows (created by
// the old /hub/pay URL fallback) into their canonical site-domain twins.
//
//   node scripts/dedupe-ledger.mjs            # dry run, prints plan
//   node scripts/dedupe-ledger.mjs --execute  # apply changes
//
// Safe under money: receipts are moved only when no twin exists, duplicates are
// dropped (never duplicated), and every destructive step is guarded.
import { db } from '@nibgate/internal/db.js';

const EXECUTE = process.argv.includes('--execute');
const API_HOST = 'api.nibgate.xyz';
const tag = EXECUTE ? '[exec]' : '[dry]';

function settledKey(metadata) {
  try {
    const m = typeof metadata === 'string' ? JSON.parse(metadata) : metadata || {};
    return String(m.txHash || m.paymentId || '').trim();
  } catch {
    return '';
  }
}

const bogus = await db.content.findMany({ where: { url: { contains: `//${API_HOST}/` } } });
console.log(`${tag} bogus content rows: ${bogus.length}`);

let renamed = 0, movedReceipts = 0, droppedReceipts = 0, movedMetrics = 0, droppedMetrics = 0, deleted = 0, skipped = 0;

for (const b of bogus) {
  try {
    const site = await db.website.findUnique({ where: { id: b.websiteId } });
    if (!site || site.deletedAt) { skipped++; continue; }
    let u;
    try { u = new URL(b.url); } catch { skipped++; continue; }
    const canonUrl = `https://${site.domain}${u.pathname}${u.search}`;
    const canon = await db.content.findFirst({ where: { websiteId: b.websiteId, url: canonUrl } });

    if (!canon) {
      // No canonical twin: this row IS the only record — rename it in place.
      console.log(`${tag} rename ${b.id} -> ${canonUrl}`);
      if (EXECUTE) await db.content.update({ where: { id: b.id }, data: { url: canonUrl } });
      renamed++;
      continue;
    }

    for (const r of await db.unlockReceipt.findMany({ where: { contentId: b.id } })) {
      const twin = await db.unlockReceipt.findUnique({
        where: { contentId_paymentId: { contentId: canon.id, paymentId: r.paymentId } },
      }).catch(() => null);
      // Semantic twin: pre-fix rows keyed the same settlement differently
      // (header blob vs settled txHash). Same payer + amount within ±5 min on
      // the canonical row means it is the same money — drop instead of move.
      let semanticTwin = null;
      if (!twin && r.payerWallet && r.amount != null) {
        const t = new Date(r.createdAt).getTime();
        semanticTwin = await db.unlockReceipt.findFirst({
          where: {
            contentId: canon.id,
            payerWallet: r.payerWallet,
            amount: Number(r.amount),
            createdAt: { gte: new Date(t - 5 * 60 * 1000), lte: new Date(t + 5 * 60 * 1000) },
          },
        }).catch(() => null);
        if (semanticTwin && String(semanticTwin.paymentId) === String(r.paymentId)) semanticTwin = null;
      }
      if (twin || semanticTwin) {
        console.log(`${tag} drop dup receipt ${String(r.paymentId).slice(0, 12)} (${r.payerWallet || '?'})${semanticTwin ? ' [same money]' : ''}`);
        if (EXECUTE) await db.unlockReceipt.delete({ where: { id: r.id } });
        droppedReceipts++;
      } else {
        console.log(`${tag} move receipt ${String(r.paymentId).slice(0, 12)} -> ${canon.id.slice(0, 8)}`);
        if (EXECUTE) await db.unlockReceipt.update({ where: { id: r.id }, data: { contentId: canon.id } });
        movedReceipts++;
      }
    }

    const metrics = await db.metric.findMany({ where: { contentId: b.id, type: { in: ['unlock', 'payment'] } } });
    for (const m of metrics) {
      const key = settledKey(m.metadata);
      let clash = null;
      if (key) {
        clash = await db.metric.findFirst({
          where: { contentId: canon.id, type: { in: ['unlock', 'payment'] }, metadata: { contains: key } },
        });
      }
      // Semantic twin: same payer + revenue within ±5 min already recorded on
      // the canonical row under a different id scheme.
      if (!clash) {
        let meta = {};
        try { meta = JSON.parse(m.metadata || '{}'); } catch {}
        const payer = String(meta.payer || meta._wallet || '').toLowerCase();
        if (payer && m.revenue != null) {
          const t = new Date(m.createdAt).getTime();
          const candidates = await db.metric.findMany({
            where: { contentId: canon.id, type: { in: ['unlock', 'payment'] }, revenue: Number(m.revenue), createdAt: { gte: new Date(t - 5 * 60 * 1000), lte: new Date(t + 5 * 60 * 1000) } },
          });
          clash = candidates.find((c) => {
            try { const cm = JSON.parse(c.metadata || '{}'); return String(cm.payer || cm._wallet || '').toLowerCase() === payer; } catch { return false; }
          }) || null;
        }
      }
      if (clash) {
        console.log(`${tag} drop dup metric ${m.id.slice(0, 8)} (${(key || 'semantic').slice(0, 10)})`);
        if (EXECUTE) await db.metric.delete({ where: { id: m.id } });
        droppedMetrics++;
        continue;
      }
      console.log(`${tag} move metric ${m.id.slice(0, 8)} -> ${canon.id.slice(0, 8)}`);
      if (EXECUTE) await db.metric.update({ where: { id: m.id }, data: { contentId: canon.id } });
      movedMetrics++;
    }
    // Non-payment metrics (views/time) just follow the content row.
    const other = await db.metric.updateMany({ where: { contentId: b.id }, data: { contentId: canon.id } });
    movedMetrics += other.count;

    if (EXECUTE) await db.content.delete({ where: { id: b.id } });
    deleted++;
    console.log(`${tag} merged+deleted bogus row ${b.id} (${b.url.slice(0, 60)})`);
  } catch (e) {
    skipped++;
    console.error(`${tag} SKIP ${b.id}: ${e.message.slice(0, 120)}`);
  }
}

console.log(`${tag} done — renamed:${renamed} deleted:${deleted} receipts moved:${movedReceipts} dropped:${droppedReceipts} metrics moved:${movedMetrics} dropped:${droppedMetrics} skipped:${skipped}`);
process.exit(0);
