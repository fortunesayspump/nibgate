// Historical events do not record whether their content was public at the time.
// Return network-wide totals only; never return individual events or identifiers.
export async function ledgerTotals(db) {
  const website = { deletedAt: null, isVerified: true, verificationStatus: 'verified' };
  const receipts = { website, status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] } };
  const [views, unlocks, ratings, tips, nibshareViews, nibshareUnlocks, revenue] = await Promise.all([
    db.metric.count({ where: { type: 'view', contentId: { not: null }, website } }),
    db.unlockReceipt.count({ where: receipts }),
    db.contentRating.count({ where: { status: 'accepted', proof: { startsWith: 'onchain:' }, website } }),
    db.tip.count({ where: { status: { in: ['settled', 'released'] } } }),
    db.nibShareEvent.count({ where: { type: 'view' } }),
    db.nibShareReceipt.count({ where: { amount: { gt: 0 } } }),
    db.nibShareReceipt.aggregate({ where: { amount: { gt: 0 } }, _sum: { amount: true } }),
  ]);
  return { views, unlocks, payments: unlocks, ratings, tips, nibshareViews, nibshareUnlocks,
    nibshareRevenue: Number(revenue._sum.amount || 0), total: views + unlocks + ratings + tips + nibshareViews + nibshareUnlocks };
}
