import { describe, expect, it, vi } from 'vitest';
import { ledgerTotals } from './ledger-totals.js';

function fixture() {
  return {
    metric: { count: vi.fn().mockResolvedValue(3) },
    unlockReceipt: { count: vi.fn().mockResolvedValue(2) },
    contentRating: { count: vi.fn().mockResolvedValue(1) },
    tip: { count: vi.fn().mockResolvedValue(4) },
    nibShareEvent: { count: vi.fn().mockResolvedValue(5) },
    nibShareReceipt: { count: vi.fn().mockResolvedValue(6), aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 7.5 } }) },
  };
}

describe('network ledger totals', () => {
  it('includes private share activity only in network-wide counts', async () => {
    const db = fixture();
    expect(await ledgerTotals(db)).toEqual({ views: 3, unlocks: 2, payments: 2, ratings: 1, tips: 4, nibshareViews: 5, nibshareUnlocks: 6, nibshareRevenue: 7.5, total: 21 });
    expect(db.nibShareEvent.count).toHaveBeenCalledWith({ where: { type: 'view' } });
    expect(db.nibShareReceipt.aggregate).toHaveBeenCalledWith({ where: { amount: { gt: 0 } }, _sum: { amount: true } });
  });
  it('fails instead of reporting zero when a count fails', async () => {
    const db = fixture();
    db.metric.count.mockRejectedValue(new Error('database unavailable'));
    await expect(ledgerTotals(db)).rejects.toThrow('database unavailable');
  });
});
