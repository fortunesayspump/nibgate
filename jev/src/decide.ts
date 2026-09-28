import type { JevDecision, JevOption, JevPolicy } from './schema.ts';

/** Deterministic value of one option under a policy. Pure function. */
export function optionValue(option: JevOption, policy: JevPolicy): number {
  const penalty = policy.costPenalty ?? 1;
  let value = 0;
  for (const [signal, weight] of Object.entries(policy.weights)) {
    const score = option.scores[signal] ?? 0;
    value += weight * Math.min(1, Math.max(0, score));
  }
  return value - penalty * Math.max(0, option.cost);
}

function reasonsFor(option: JevOption, policy: JevPolicy, value: number): string[] {
  const penalty = policy.costPenalty ?? 1;
  const parts = Object.entries(policy.weights)
    .map(([signal, weight]) => {
      const score = option.scores[signal] ?? 0;
      return { signal, contribution: weight * score, score };
    })
    .filter((p) => p.contribution !== 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((p) => `${p.signal} ${p.score.toFixed(2)} (weight ${policy.weights[p.signal]})`);
  const out = [`value ${value.toFixed(3)} vs cost ${option.cost}`];
  if (parts.length) out.push(...parts);
  return out;
}

/**
 * Multi-pick variant for slates: metadata tags, rankings, candidate shortlists.
 * Same value function and gates as decide(), applied in rank order with the
 * budget consumed sequentially. Deterministic.
 */
export interface JevPick {
  option: JevOption;
  value: number;
  reasons: string[];
  budgetAfter: number;
}

export interface JevSlate {
  picks: JevPick[];
  skipped: Array<{ option: JevOption; reason: string }>;
  escalated: Array<{ option: JevOption; reason: string }>;
  budgetAfter: number;
}

export function selectMany(
  options: JevOption[],
  policy: JevPolicy,
  maxPicks = Infinity,
): JevSlate {
  const cap = policy.maxCost ?? policy.budgetRemaining;
  const minConfidence = policy.minConfidence ?? 0;
  const slate: JevSlate = { picks: [], skipped: [], escalated: [], budgetAfter: policy.budgetRemaining };

  const ranked = options
    .map((o) => ({ o, value: optionValue(o, policy) }))
    .sort((a, b) => b.value - a.value || (a.o.id < b.o.id ? -1 : 1));

  for (const { o, value } of ranked) {
    if (slate.picks.length >= maxPicks) {
      slate.skipped.push({ option: o, reason: 'beyond max picks' });
      continue;
    }
    if (o.cost < 0 || o.cost > Math.min(cap, slate.budgetAfter)) {
      slate.skipped.push({ option: o, reason: `unaffordable (cost ${o.cost}, remaining ${slate.budgetAfter})` });
      continue;
    }
    const confidence = o.scores['confidence'] ?? 1;
    if (confidence < minConfidence) {
      slate.escalated.push({ option: o, reason: `confidence ${confidence.toFixed(2)} below ${minConfidence}` });
      continue;
    }
    if (value <= 0) {
      slate.skipped.push({ option: o, reason: `value ${value.toFixed(3)} not worth it` });
      continue;
    }
    slate.budgetAfter -= o.cost;
    slate.picks.push({ option: o, value, reasons: reasonsFor(o, policy, value), budgetAfter: slate.budgetAfter });
  }
  return slate;
}

/**
 * Decide one round (single winner). Deterministic: same inputs → same output,
 * ties broken by option id. Never executes anything — callers act on it.
 */
export function decide(options: JevOption[], policy: JevPolicy): JevDecision {
  const cap = policy.maxCost ?? policy.budgetRemaining;
  const minConfidence = policy.minConfidence ?? 0;

  const eligible = options.filter((o) => o.cost >= 0 && o.cost <= Math.min(cap, policy.budgetRemaining));
  if (!eligible.length) {
    return {
      kind: 'skip_all', optionId: null, action: 'skip', value: 0,
      reasons: ['no affordable options within budget'],
      budgetAfter: policy.budgetRemaining, escalated: false,
    };
  }

  const ranked = eligible
    .map((o) => ({ o, value: optionValue(o, policy) }))
    .sort((a, b) => b.value - a.value || (a.o.id < b.o.id ? -1 : 1));
  const winner = ranked[0];

  const confidence = winner.o.scores['confidence'] ?? 1;
  if (confidence < minConfidence) {
    return {
      kind: 'escalate', optionId: winner.o.id, action: 'escalate', value: winner.value,
      reasons: [`confidence ${confidence.toFixed(2)} below threshold ${minConfidence} — human decides`],
      budgetAfter: policy.budgetRemaining, escalated: true,
    };
  }

  if (winner.value <= 0) {
    return {
      kind: 'skip_all', optionId: null, action: 'skip', value: 0,
      reasons: [`best option value ${winner.value.toFixed(3)} not worth it`],
      budgetAfter: policy.budgetRemaining, escalated: false,
    };
  }

  return {
    kind: 'select', optionId: winner.o.id, action: winner.o.kind, value: winner.value,
    reasons: reasonsFor(winner.o, policy, winner.value),
    budgetAfter: policy.budgetRemaining - winner.o.cost, escalated: false,
  };
}
