import type { JevDecision, JevOption, JevPolicy } from './schema.ts';

/**
 * Human-readable decision trace. Shows factors + outcome, never private
 * reasoning (there is none — the engine is deterministic arithmetic).
 */
export function renderTrace(
  decision: JevDecision,
  options: JevOption[],
  policy: JevPolicy,
): string {
  const lines = ['DECISION'];
  const byId = new Map(options.map((o) => [o.id, o]));
  if (decision.kind === 'select' && decision.optionId) {
    const o = byId.get(decision.optionId);
    lines.push(`Action → ${decision.action.toUpperCase()} (${decision.optionId})`);
    if (o) {
      lines.push(`Cost: ${o.cost}`);
      const scored = Object.entries(o.scores)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${Number(v).toFixed(2)}`)
        .join(' · ');
      if (scored) lines.push(`Signals: ${scored}`);
    }
    lines.push(`Budget: ${policy.budgetRemaining} → ${decision.budgetAfter}`);
  } else if (decision.kind === 'escalate') {
    lines.push(`Action → ESCALATE${decision.optionId ? ` (${decision.optionId})` : ''}`);
    lines.push(`Budget untouched: ${policy.budgetRemaining}`);
  } else {
    lines.push('Action → SKIP (nothing worth it)');
    lines.push(`Budget untouched: ${policy.budgetRemaining}`);
  }
  lines.push('Reason');
  decision.reasons.forEach((r) => lines.push(r));
  return lines.join('\n');
}
