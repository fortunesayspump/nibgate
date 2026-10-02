// Run the eval gates against one finished run.
//
// evaluateRun collects what the run recorded and checks every gate. A gate
// failure returns ok:false with the offending metrics — the caller (CI, or a
// human reading the audit) sees exactly which quality bar broke, not a bare
// red build.
import { db } from '../db.js';
import {
  citationResolutionRate, costPerSupportedClaim, gateThresholds,
  stoppingEfficiency, supportedRate, uncitedRate,
} from './metrics.js';
import { budgetState } from '../money.js';

export async function evaluateRun(runId) {
  const [sources, claims, steps, run] = await Promise.all([
    db.researchSource.findMany({ where: { runId } }),
    db.researchClaim.findMany({ where: { runId } }),
    db.researchStep.findMany({ where: { runId } }),
    db.researchRun.findUniqueOrThrow({ where: { id: runId } }),
  ]);
  const state = await budgetState(runId);
  const resolution = citationResolutionRate(claims, sources.map((s) => s.url));
  const supported = supportedRate(claims);
  const uncited = uncitedRate(claims);
  const cost = costPerSupportedClaim(state.used, supported.supported);
  const stopping = stoppingEfficiency(steps.length, run.depth);
  const t = gateThresholds();

  const failures = [];
  if (resolution.rate < t.minResolution) failures.push(`citation-resolution ${resolution.rate.toFixed(3)} < ${t.minResolution}`);
  if (supported.rate < t.minSupported) failures.push(`supported-rate ${supported.rate.toFixed(3)} < ${t.minSupported}`);
  if (uncited.rate > t.maxUncited) failures.push(`uncited-rate ${uncited.rate.toFixed(3)} > ${t.maxUncited}`);
  if (cost.cost > t.maxCostPerClaim) failures.push(`cost-per-claim $${cost.cost.toFixed(4)} > $${t.maxCostPerClaim}`);
  if (!stopping.within) failures.push(`steps ${stopping.steps} > ${stopping.allowance} for depth ${run.depth}`);

  return {
    ok: failures.length === 0,
    failures,
    metrics: { resolution, supported, uncited, cost, stopping, spend: state.used },
  };
}
