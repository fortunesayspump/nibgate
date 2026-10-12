// Verbatim-overlap measurement: containment of claim phrasing in passages.
import { describe, expect, it } from 'vitest';
import { claimOverlap, COPY_THRESHOLD, isCopied, MIN_CLAIM_WORDS, shingles, SHINGLE_N } from './originality.js';
import { originalityRate } from './evals/metrics.js';

describe('shingling', () => {
  it('produces word n-grams case-insensitively', () => {
    const s = shingles('Arc charges flat fees for transfers today', 6);
    expect(s.size).toBeGreaterThan(0);
    for (const g of s) expect(g.split(' ').length).toBe(SHINGLE_N);
    expect(shingles('ARC CHARGES FLAT FEES FOR TRANSFERS TODAY', 6)).toEqual(s);
  });

  it('ignores punctuation', () => {
    expect(shingles('Hello, world! Foo bar baz qux.', 6)).toEqual(shingles('hello world foo bar baz qux', 6));
  });
});

describe('claimOverlap', () => {
  const passage = 'Arc charges a flat predictable fee for transfers on its testnet network today always';
  it('scores verbatim restatement near 1', () => {
    expect(claimOverlap('Arc charges a flat predictable fee for transfers on its testnet network', passage)).toBeGreaterThanOrEqual(COPY_THRESHOLD);
  });

  it('scores paraphrase low', () => {
    expect(claimOverlap('Transfer costs on the new chain stay low and stable for most users daily', passage)).toBeLessThan(0.5);
  });

  it('refuses to judge short claims and empty passages', () => {
    expect(claimOverlap('fees are low', passage)).toBe(0);
    expect(claimOverlap('Arc charges a flat predictable fee for transfers on its testnet network', '')).toBe(0);
    expect(`short claims need ${MIN_CLAIM_WORDS} words`).toBeTruthy();
  });

  it('isCopied follows the threshold', () => {
    expect(isCopied('Arc charges a flat predictable fee for transfers on its testnet network', passage)).toBe(true);
    expect(isCopied('Transfer costs on the new chain stay low and stable for most users daily', passage)).toBe(false);
  });
});

describe('originalityRate', () => {
  it('counts only evidenced claims, flagging high-overlap ones', () => {
    const out = originalityRate([
      { text: 'a', passages: [{ url: 'u1', overlap: 0.1 }] },
      { text: 'b', passages: [{ url: 'u2', overlap: 0.95 }] },
      { text: 'c', passages: [] },
    ]);
    expect(out.total).toBe(2);
    expect(out.original).toBe(1);
    expect(out.rate).toBe(0.5);
    expect(out.copied).toEqual(['b']);
  });

  it('is vacuously perfect with no evidenced claims', () => {
    expect(originalityRate([])).toMatchObject({ rate: 1, total: 0 });
  });
});
