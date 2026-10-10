import { describe, expect, it } from 'vitest';
import { spendable } from './money.js';

describe('spendable', () => {
  it('is cap minus used, ignoring settle history', () => {
    expect(spendable(2, 0.27)).toBeCloseTo(1.73, 6);
  });
  it('stays correct after an early settle + reprompt (the live -0.128 case)', () => {
    // $2 cap, $0.27 used, $1.85 already refunded: ledger balance reads
    // negative, but the cap still authorizes $1.73 of further spend.
    expect(spendable(2, 0.27)).toBeGreaterThan(0);
  });
  it('is zero/negative only when the cap is truly exhausted', () => {
    expect(spendable(2, 2)).toBe(0);
    expect(spendable(2, 2.5)).toBeLessThan(0);
  });
});
