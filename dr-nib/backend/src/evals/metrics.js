// Eval metrics — pure functions over run data, no I/O.
//
// These are the build gates for research quality. Each metric is computed from
// what the run actually recorded (claims, passages, sources, ledger), never
// from what anybody hoped. Thresholds live in env with strict defaults so a
// regression fails the build rather than shipping quietly.

export function citationResolutionRate(claims, sourceUrls) {
  const known = new Set((sourceUrls || []).map((u) => String(u)));
  const withPassages = (claims || []).filter((c) => Array.isArray(c.passages) && c.passages.length > 0);
  if (!withPassages.length) return { rate: 0, total: (claims || []).length, resolved: 0, unresolved: [] };
  const unresolved = [];
  for (const c of withPassages) {
    const ok = c.passages.some((p) => p?.url && known.has(String(p.url)));
    if (!ok) unresolved.push(c.text);
  }
  const resolved = withPassages.length - unresolved.length;
  return { rate: resolved / withPassages.length, total: withPassages.length, resolved, unresolved };
}

export function supportedRate(claims) {
  const list = claims || [];
  if (!list.length) return { rate: 0, total: 0, supported: 0 };
  const supported = list.filter((c) => c.status === 'supported').length;
  return { rate: supported / list.length, total: list.length, supported };
}

export function uncitedRate(claims) {
  const list = claims || [];
  if (!list.length) return { rate: 0, total: 0, uncited: 0 };
  const uncited = list.filter((c) => !Array.isArray(c.passages) || c.passages.length === 0).length;
  return { rate: uncited / list.length, total: list.length, uncited };
}

export function costPerSupportedClaim(spend, supportedCount) {
  if (!supportedCount) return { cost: Infinity, spend, supported: 0 };
  return { cost: spend / supportedCount, spend, supported: supportedCount };
}

// Steps used against the depth allowance: a run that burns its whole tree on
// one branch is working hard, not well. Over-allowance fails the gate.
const STEP_ALLOWANCE = { quick: 8, standard: 14, deep: 24 };

export function stoppingEfficiency(stepCount, depth) {
  const allowance = STEP_ALLOWANCE[depth] || STEP_ALLOWANCE.standard;
  return { steps: stepCount, allowance, within: stepCount <= allowance };
}

export function gateThresholds() {
  const num = (name, fallback) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    minResolution: num('EVAL_MIN_RESOLUTION', 1.0),
    minSupported: num('EVAL_MIN_SUPPORTED', 0.5),
    maxUncited: num('EVAL_MAX_UNCITED', 0.2),
    maxCostPerClaim: num('EVAL_MAX_COST_PER_CLAIM', 1.0),
  };
}
