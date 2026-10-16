import {minimizeDecision, allowedDecisionRoute} from './decision-minimization.js';

const OPTIONS=Object.freeze([Object.freeze({id:'continue',context:'Another bounded evidence round may materially improve coverage.'}),Object.freeze({id:'write',context:'Write the report with transparent uncertainty and limitations.'})]);
const INSTRUCTIONS='Choose only between another bounded evidence round and writing with limitations. Hard budget and depth limits are enforced locally.';
/** Pure payload builder. Caller must independently approve any metadata disclosure. */
export function buildMinimizedRoundChoice(features) {
  const safe=minimizeDecision(features);
  if(safe.decision!=='continue_or_write') throw new Error('UNAPPROVED_DECISION');
  if(safe.withinLimits!==true) throw new Error('HARD_LIMIT_LOCAL_WRITE');
  return Object.freeze({state:JSON.stringify(safe),instructions:INSTRUCTIONS,options:OPTIONS,questionId:'private-workflow-v1'});
}
/** Until real attested runtime/provider policy exists, no production caller is wired. */
export function privateJevRoute(policy) {
  if (!policy || policy.requiresContent!==false) throw new Error('PRIVATE_JEV_ROUTE_UNAVAILABLE');
  const route=allowedDecisionRoute(policy);
  if(route!=='minimized_external_decision' || policy?.zeroRetentionEndpointVerified!==true || policy?.hubPathInsideBoundary!==true)
    throw new Error('PRIVATE_JEV_ROUTE_UNAVAILABLE');
  return route;
}
