import { describe, expect, it } from 'vitest';
import { reportVerificationChunks, sampleClaimsAcrossChunks } from './verify.js';

describe('report-wide claim verification sampling', () => {
  it('includes the tail of a long report instead of silently clipping at the introduction', () => {
    const report = `Intro ${'a'.repeat(10500)}\n\n## Findings\n\nThe final conclusion is cited [7].`;
    const coverage = reportVerificationChunks(report);
    expect(coverage.complete).toBe(true);
    expect(coverage.chunks.length).toBeGreaterThan(1);
    expect(coverage.chunks.join('')).toBe(report);
    expect(coverage.chunks.at(-1)).toContain('The final conclusion');
  });

  it('samples later sections even when the claim budget is smaller than the section count', () => {
    const groups = Array.from({ length: 10 }, (_, i) => [{ text: `section ${i}`, citations: [i + 1] }]);
    const sampled = sampleClaimsAcrossChunks(groups, 3);
    expect(sampled.map(c => c.text)).toEqual(['section 0', 'section 5', 'section 9']);
  });

  it('deduplicates repeated claims and reports incomplete coverage for huge reports', () => {
    const sampled = sampleClaimsAcrossChunks([
      [{ text: 'Same claim', citations: [1] }],
      [{ text: 'same   claim', citations: [2] }, { text: 'Another claim', citations: [3] }],
    ], 3);
    expect(sampled.map(c => c.text)).toEqual(['Same claim', 'Another claim']);
    expect(reportVerificationChunks('x'.repeat(250000)).complete).toBe(false);
  });
});
