import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decide, selectMany } from '../src/decide.ts';
import { renderTrace } from '../src/trace.ts';
import type { JevPolicy } from '../src/schema.ts';

const policy: JevPolicy = {
  budgetRemaining: 3,
  minConfidence: 0.5,
  weights: { relevance: 0.4, uniqueness: 0.3, reputation: 0.2, confidence: 0.1 },
};

describe('decide', () => {
  it('picks the best-value affordable option (the demo spread)', () => {
    const d = decide(
      [
        { id: 'A', kind: 'skip', cost: 0.05, scores: { relevance: 0.9, uniqueness: 0.2, reputation: 0.8, confidence: 0.9 } },
        { id: 'B', kind: 'unlock', cost: 0.15, scores: { relevance: 0.95, uniqueness: 0.9, reputation: 0.8, confidence: 0.9 } },
        { id: 'C', kind: 'use', cost: 0, scores: { relevance: 0.8, uniqueness: 0.4, reputation: 0.9, confidence: 0.95 } },
        { id: 'D', kind: 'tip', cost: 0.5, scores: { relevance: 0.9, uniqueness: 0.95, reputation: 0.9, confidence: 0.85 } },
      ],
      policy,
    );
    assert.equal(d.kind, 'select');
    assert.equal(d.optionId, 'B');
    assert.ok(d.budgetAfter < policy.budgetRemaining);
    assert.ok(d.reasons.length > 0);
  });

  it('skips everything when nothing is affordable', () => {
    const d = decide(
      [{ id: 'X', kind: 'unlock', cost: 99, scores: { relevance: 1, confidence: 1 } }],
      policy,
    );
    assert.equal(d.kind, 'skip_all');
    assert.equal(d.budgetAfter, policy.budgetRemaining);
  });

  it('escalates below the confidence threshold', () => {
    const d = decide(
      [{ id: 'Y', kind: 'tip', cost: 0.1, scores: { relevance: 0.9, confidence: 0.2 } }],
      policy,
    );
    assert.equal(d.kind, 'escalate');
    assert.equal(d.escalated, true);
  });

  it('breaks ties deterministically by id', () => {
    const opts = [
      { id: 'b', kind: 'tip', cost: 0.1, scores: { relevance: 0.5 } },
      { id: 'a', kind: 'tip', cost: 0.1, scores: { relevance: 0.5 } },
    ];
    const d1 = decide(opts, { budgetRemaining: 5, weights: { relevance: 1 } });
    const d2 = decide([...opts].reverse(), { budgetRemaining: 5, weights: { relevance: 1 } });
    assert.equal(d1.optionId, 'a');
    assert.equal(d2.optionId, 'a');
  });

  it('renders a trace with action, cost, and reasons', () => {
    const opts = [{ id: 'B', kind: 'unlock', cost: 0.2, scores: { relevance: 0.9 } }];
    const d = decide(opts, { budgetRemaining: 3, weights: { relevance: 1 } });
    const t = renderTrace(d, opts, { budgetRemaining: 3, weights: { relevance: 1 } });
    assert.match(t, /UNLOCK/);
    assert.match(t, /0\.2/);
    assert.match(t, /Budget/);
  });
});

describe('selectMany', () => {
  const pol: JevPolicy = {
    budgetRemaining: 1,
    minConfidence: 0.5,
    weights: { relevance: 0.6, uniqueness: 0.4 },
  };
  const opts = [
    { id: 't1', kind: 'tag', cost: 0, scores: { relevance: 0.9, uniqueness: 0.8, confidence: 0.9 } },
    { id: 't2', kind: 'tag', cost: 0, scores: { relevance: 0.7, uniqueness: 0.9, confidence: 0.9 } },
    { id: 't3', kind: 'tag', cost: 0, scores: { relevance: 0.6, uniqueness: 0.2, confidence: 0.9 } },
    { id: 't4', kind: 'tag', cost: 0, scores: { relevance: 0.9, uniqueness: 0.9, confidence: 0.1 } },
    { id: 't5', kind: 'tag', cost: 5, scores: { relevance: 1, uniqueness: 1, confidence: 1 } },
  ];

  it('picks an ordered slate, escalates low confidence, skips the rest', () => {
    const s = selectMany(opts, pol, 2);
    assert.deepEqual(s.picks.map((p) => p.option.id), ['t1', 't2']);
    assert.equal(s.escalated.length, 1);
    assert.equal(s.escalated[0].option.id, 't4');
    assert.ok(s.skipped.some((x) => x.option.id === 't5')); // unaffordable
    assert.equal(s.budgetAfter, 1); // tags cost nothing
  });

  it('spends budget sequentially across paid picks', () => {
    const s = selectMany(
      [
        { id: 'a', kind: 'unlock', cost: 0.6, scores: { relevance: 0.9, confidence: 0.9 } },
        { id: 'b', kind: 'unlock', cost: 0.6, scores: { relevance: 0.8, confidence: 0.9 } },
      ],
      { budgetRemaining: 1, weights: { relevance: 1 } },
    );
    assert.equal(s.picks.length, 1);
    assert.equal(s.picks[0].option.id, 'a');
    assert.ok(Math.abs(s.budgetAfter - 0.4) < 1e-9);
  });
});
