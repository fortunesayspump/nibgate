// Evaluation prototype only. This module does not call JEV or infer factual quality.
const keys = new Set(['decision', 'coverage', 'freshness', 'provenance', 'contradictions', 'verification', 'remainingWork', 'withinLimits']);
const enums = {
 decision: ['continue_or_write'],
 coverage: ['insufficient', 'partial', 'sufficient', 'unknown'],
 freshness: ['current', 'outdated', 'mixed', 'unknown', 'not_applicable'],
 provenance: ['verified', 'unverified', 'mixed', 'unknown'],
 contradictions: ['present', 'absent', 'unknown'],
 verification: ['passed', 'failed', 'incomplete', 'unknown'],
 remainingWork: ['material', 'minor', 'none', 'unknown'],
};
export function minimizeDecision(features) {
 if (!features || typeof features !== 'object' || Array.isArray(features) || Object.getPrototypeOf(features) !== Object.prototype) throw new Error('INVALID_FEATURES');
 const descriptors = Object.getOwnPropertyDescriptors(features);
 if (Object.getOwnPropertySymbols(features).length || Object.keys(descriptors).some(k => !keys.has(k))) throw new Error('UNAPPROVED_FIELD');
 const result = {};
 for (const name of keys) {
  const d = descriptors[name];
  if (!d || !Object.hasOwn(d, 'value')) throw new Error('MISSING_OR_DYNAMIC_FIELD');
  const value = d.value;
  if (name === 'withinLimits') {
   if (typeof value !== 'boolean') throw new Error('INVALID_FEATURE');
  } else if (typeof value !== 'string' || !enums[name].includes(value)) throw new Error('INVALID_FEATURE');
  result[name] = value;
 }
 return Object.freeze(result);
}
export function allowedDecisionRoute({ requiresContent, metadataDisclosureApproved, attestedAnalysisVerified }) {
 if (requiresContent === true) return attestedAnalysisVerified === true ? 'attested_content_analysis' : 'pause';
 if (requiresContent !== false || attestedAnalysisVerified !== true || metadataDisclosureApproved !== true) return 'pause';
 return 'minimized_external_decision';
}
