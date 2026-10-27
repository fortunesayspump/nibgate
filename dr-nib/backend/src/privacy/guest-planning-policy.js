import { createHash } from 'node:crypto';
import { canonicalCiphertext } from './ciphertext-digest.js';

const ACTIONS = new Set(['intake', 'answers', 'finish-intake', 'configure', 'edit-plan']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = code => { throw Error(code); };
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
/** Only persisted broker-owned run metadata grants anonymous planning. Client
 * workflow state, supplied budgets and a connected wallet cannot grant it. */
export function guestPlanningPolicy(run, now = Date.now()) {
  const policy = run?.metadata?.guestPlanning;
  if (!policy && !String(run?.userId ?? '').startsWith('guest:')) return null;
  if (!policy || !UUID.test(policy.sessionId ?? '') || run.userId !== `guest:${policy.sessionId}` ||
      !integer(policy.maxActions, 1, 32) || !integer(policy.maxReplans, 1, 5) ||
      !integer(policy.maxCostMicroUsd, 1, 1000000) || !integer(policy.planTtlMs, 1000, 3600000) ||
      !Number.isFinite(Date.parse(policy.expiresAt)) || typeof policy.frozen !== 'boolean' || typeof policy.adopted !== 'boolean')
    fail('PRIVATE_GUEST_POLICY_INVALID');
  if (policy.frozen || policy.adopted || now >= Date.parse(policy.expiresAt)) fail('PRIVATE_GUEST_SESSION_CLOSED');
  return policy;
}
export function assertGuestPlanningAction(run, action, state, args = {}, sources = [], now = Date.now()) {
  const policy = guestPlanningPolicy(run, now);
  if (!policy) return null;
  if (!ACTIONS.has(action)) fail('PRIVATE_GUEST_ACTION_DENIED');
  if (sources.length || state?.sources?.length || state?.reports?.length || state?.privateCheckpoint || state?.pendingQuestion?.externalRequest)
    fail('PRIVATE_GUEST_FILES_OR_TOOLS_DENIED');
  if (!state || typeof state.brief?.topic !== 'string' || state.brief.topic.trim().length < 3 || state.brief.topic.length > 1000 ||
      Buffer.byteLength(JSON.stringify(state)) > 192 * 1024 || Buffer.byteLength(JSON.stringify(args)) > 32768)
    fail('PRIVATE_GUEST_INPUT_LIMIT');
  if (action === 'edit-plan') {
    const proof = run.metadata.guestPlan, current = guestPlanDigests(state);
    if (!proof || proof.planDigest !== current.planDigest || proof.inputDigest !== current.inputDigest || now >= Date.parse(proof.expiresAt)) fail('PRIVATE_GUEST_PLAN_CHANGED');
  }
  const allowed = { intake: [], answers: ['answers'], 'finish-intake': [], configure: ['depth','budgetCap','liveWeb','searchEnabled','tipCreators','length','lengthWords','formats','publicResearch'], 'edit-plan': ['sub_questions'] }[action];
  if (Object.keys(args).some(key => !allowed.includes(key))) fail('PRIVATE_GUEST_ACTION_DENIED');
  if (action === 'configure' && (args.tipCreators === true || args.lengthWords > 12000 ||
      args.formats !== undefined && (!Array.isArray(args.formats) || args.formats.length > 4))) fail('PRIVATE_GUEST_INPUT_LIMIT');
  return policy;
}
export function admitGuestPlanningAction(run, action, now = Date.now()) {
  const policy = guestPlanningPolicy(run, now);
  if (!policy) return null;
  if (!ACTIONS.has(action)) fail('PRIVATE_GUEST_ACTION_DENIED');
  const count = policy.actionCount ?? 0, replans = policy.replanCount ?? 0;
  if (!integer(count, 0, policy.maxActions) || !integer(replans, 0, policy.maxReplans) || count >= policy.maxActions)
    fail('PRIVATE_GUEST_ACTION_LIMIT');
  const planning = action === 'configure' || action === 'edit-plan';
  if (planning && replans >= policy.maxReplans) fail('PRIVATE_GUEST_REPLAN_LIMIT');
  return { ...policy, actionCount: count + 1, replanCount: replans + (planning ? 1 : 0) };
}
const hash = value => createHash('sha256').update(canonicalCiphertext(value)).digest('hex');
export const guestPlanDigests = state => ({ planDigest: hash(state.plan), inputDigest: hash({ brief: state.brief, budgetCap: state.budgetCap }) });
export function guestPlanAttestation(state, ttlMs, now = Date.now()) {
  if (state.status !== 'planned' || state.plan?.source !== 'llm') fail('PRIVATE_GUEST_PLAN_INVALID');
  return { version: 1, ...guestPlanDigests(state), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString(), modelPolicy: state.plan.modelPolicy ?? 'private-workflow-v1' };
}
/** Rechecking or editing a plan never extends its generation lifetime. */
export function nextGuestPlanAttestation(state, action, previous, ttlMs, now = Date.now()) {
  if (action === 'configure') return guestPlanAttestation(state, ttlMs, now);
  if (!['edit-plan','validate-plan'].includes(action) || !previous || previous.version !== 1 ||
      !Number.isFinite(Date.parse(previous.issuedAt)) || !Number.isFinite(Date.parse(previous.expiresAt)) || now >= Date.parse(previous.expiresAt)) fail('PRIVATE_GUEST_PLAN_EXPIRED');
  if (state.status !== 'planned' || state.plan?.source !== 'llm') fail('PRIVATE_GUEST_PLAN_INVALID');
  return {...previous, ...guestPlanDigests(state)};
}
export function assertAdoptedGuestPlan(run, state, now = Date.now()) {
  const proof = run?.metadata?.guestPlan;
  if (!run?.metadata?.guestAdoption || !proof || proof.version !== 1 || typeof proof.modelPolicy !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(proof.modelPolicy) ||
      !Number.isFinite(Date.parse(proof.expiresAt)) || now >= Date.parse(proof.expiresAt)) fail('PRIVATE_GUEST_PLAN_EXPIRED');
  const current = guestPlanDigests(state);
  if (current.planDigest !== proof.planDigest || current.inputDigest !== proof.inputDigest) fail('PRIVATE_GUEST_PLAN_CHANGED');
  return proof;
}

/** Signed capability is already verified by the caller; anonymous identities
 * additionally need persisted policy and a planning-only worker route. */
export function guestPlanningCapabilityAllowed({identity,run,method,path,enabled}) {
  if (enabled !== true || method !== 'POST' || !identity || run?.id !== identity.runId || run?.userId !== identity.tenantId || run.deletedAt ||
      !/^\/v1\/private\/sessions(?:\/[0-9a-f-]{36}\/(?:prove|action))?$/.test(path ?? '')) return false;
  try { return guestPlanningPolicy(run) !== null; } catch { return false; }
}
export function requireAdoptedGuestFunding(run, now = Date.now()) {
  if (run?.metadata?.guestPlanning || String(run?.userId ?? '').startsWith('guest:')) fail('PRIVATE_GUEST_FUNDING_DENIED');
  if (!run?.metadata?.guestAdoption) return;
  const proof = run.metadata.guestPlan;
  if (run.metadata.guestAdoption.validationRequired !== false || !proof || proof.version !== 1 ||
      !Number.isFinite(Date.parse(proof.expiresAt)) || now >= Date.parse(proof.expiresAt) ||
      proof.manifestDigest !== run.metadata.privateFundingInputs?.manifestDigest) fail('PRIVATE_GUEST_PLAN_VALIDATION_REQUIRED');
}
