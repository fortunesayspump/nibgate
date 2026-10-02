import { describe, expect, it } from 'vitest';
import { DEPTHS, depthLimits } from './depth.js';
import { ensureAdviceNotice, RESEARCH_NOT_ADVICE } from './worker.js';

describe('depth is research intensity', () => {
  it('sizes the work up with depth', () => {
    const quick = depthLimits('quick');
    const standard = depthLimits('standard');
    const deep = depthLimits('deep');
    for (const k of ['queries', 'fetchDocs', 'scoreTop', 'claims', 'rounds']) {
      expect(quick[k]).toBeLessThanOrEqual(standard[k]);
      expect(standard[k]).toBeLessThanOrEqual(deep[k]);
    }
    expect(quick.queries).toBeGreaterThan(0);
    expect(quick.rounds).toBeGreaterThan(0);
  });

  it('falls back to standard for unknown depths rather than failing', () => {
    expect(depthLimits('ultra')).toEqual(depthLimits('standard'));
    expect(depthLimits(undefined)).toEqual(depthLimits('standard'));
    expect(DEPTHS).toEqual(['quick', 'standard', 'deep']);
  });
});

describe('advice notice', () => {
  it('attaches the notice to finance, medicine, and law topics', () => {
    for (const topic of ['Should I buy index funds', 'Understanding blood pressure medication', 'Tenant rights and eviction law']) {
      expect(ensureAdviceNotice('# Report', topic)).toContain(RESEARCH_NOT_ADVICE);
    }
  });

  it('leaves ordinary reports alone', () => {
    expect(ensureAdviceNotice('# Report', 'x402 micropayments for AI agents')).toBe('# Report');
  });

  it('never doubles the notice', () => {
    const once = ensureAdviceNotice('# Report', 'investing basics');
    expect(ensureAdviceNotice(once, 'investing basics')).toBe(once);
  });
});
