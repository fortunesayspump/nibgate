// ACI receipt compatibility probe.
//
// Answers one question: does the signed ACI receipt expose token usage / cost,
// or only the request/response proof the adapter currently reads?
//
// It also discovers the CURRENT attested sessions (the pinned model/session/
// compose-hash in owner-only-phala.env are stale — the gateway reports
// `session_not_accepted`), runs one minimal harmless completion against a live
// TEE session, then dumps the full signed receipt to a timestamped file.
//
// Secrets are never printed; the prompt carries no private or user content.
//
// Usage (with ACI creds in env — they live in owner-only-phala.env):
//   node src/privacy/aci-receipt-probe.mjs
//
// Env: PRIVATE_ACI_GATEWAY_BASE_URL, PRIVATE_AI_API_KEY (required);
//      PRIVATE_ACI_SESSION_ID / PRIVATE_AI_APPROVED_MODEL / PRIVATE_ACI_COMPOSE_HASH
//      are used as pins when set, otherwise a live session is discovered.
// Output: aci-receipt-probe-<ts>.json  (do NOT commit).

import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';

function required(env, key) {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Probe missing ${key}`);
  return value;
}

const env = process.env;
if (env.DSTACK_SIMULATOR_ENDPOINT) throw new Error('Simulator is forbidden');

const baseURL = required(env, 'PRIVATE_ACI_GATEWAY_BASE_URL').replace(/\/+$/, '');
const apiKey = required(env, 'PRIVATE_AI_API_KEY');
if (!/^https:\/\//.test(baseURL)) throw new Error('PRIVATE_ACI_GATEWAY_BASE_URL must be https');

const authHeaders = {authorization: `Bearer ${apiKey}`};

async function discoverSessions() {
  const [modelsRes, sessionsRes] = await Promise.all([
    fetch(`${baseURL}/v1/models`, {headers: authHeaders, signal: AbortSignal.timeout(20_000)}),
    fetch(`${baseURL}/v1/aci/sessions`, {headers: authHeaders, signal: AbortSignal.timeout(20_000)}),
  ]);
  if (!modelsRes.ok) throw new Error(`model discovery failed (${modelsRes.status})`);
  if (!sessionsRes.ok) throw new Error(`session discovery failed (${sessionsRes.status})`);
  const models = await modelsRes.json();
  const {sessions} = await sessionsRes.json();
  if (!Array.isArray(sessions) || sessions.length === 0) throw new Error('no attested sessions available');
  // A model is only serveable when it is both a TEE model (has a route/pricing)
  // AND has a current attested session. The session's canonical_model_id is the
  // requestable route id; the display `model`/`upstream_name` fields are not.
  const tee = new Set((models.data ?? []).filter((m) => m.is_tee).map((m) => m.id));
  const seen = new Set();
  const candidates = [];
  for (const s of sessions) {
    const model = s?.claims?.extra?.canonical_model_id;
    const sessionId = s?.session_id;
    if (typeof model !== 'string' || !model || typeof sessionId !== 'string' || !sessionId) continue;
    if (!tee.has(model) || seen.has(model)) continue;
    seen.add(model);
    candidates.push({sessionId, model, endpoint: s.endpoint});
  }
  const preferred = [env.PRIVATE_AI_APPROVED_MODEL, 'phala/qwen3.8-27b-uncensored'].filter(Boolean);
  candidates.sort((a, b) => preferred.indexOf(b.model) - preferred.indexOf(a.model));
  return candidates;
}

const {connectAci} = await import('@phala/aci-verifier/runtime');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One connection (attestation is the expensive part); sessions are chosen per
// request via provider.aci_session_ids, so a stale session only costs a retry.
const aci = await connectAci({
  baseURL,
  policy: {requireProductionOs: true},
  serving: {requireVerified: true, requireReceipt: true},
});

async function requestOnce({sessionId, model}) {
  const body = {
    model,
    messages: [{role: 'user', content: 'Reply with the single word: ok'}],
    max_tokens: 8,
    provider: {
      aci_verified: true, zdr: true, data_collection: 'deny', allow_fallbacks: false,
      require_parameters: true, aci_session_ids: [sessionId],
    },
  };
  const serialized = JSON.stringify(body);
  const wireDigest = createHash('sha256').update(serialized, 'utf8').digest('hex');
  const response = await aci.fetch(new URL(`${baseURL}/v1/chat/completions`), {
    method: 'POST', headers: {...authHeaders, 'content-type': 'application/json'}, body: serialized,
  });
  const raw = await response.text();
  if (!response.ok) return {status: response.status, note: raw.slice(0, 160)};
  const receiptId = response.headers.get('x-receipt-id');
  let completion = null;
  try { completion = JSON.parse(raw); } catch { /* keep raw length only */ }
  const audit = receiptId ? await aci.verifyReceipt(receiptId) : null;
  const receipt = audit?.receipt ?? null;
  const responseSha256 = createHash('sha256').update(raw, 'utf8').digest('hex');
  const committed = new Set((receipt?.event_log ?? [])
    .filter((e) => typeof e?.type === 'string' && e.type.startsWith('response.'))
    .map((e) => e.body_hash));
  return {
    record: {
      probedAt: new Date().toISOString(),
      gateway: baseURL,
      sessionId,
      identityComposeHash: aci.identity?.composeHash ?? null,
      identityOsImageHash: aci.identity?.transcript?.claims?.extra?.os_image_hash ?? null,
      model,
      wireDigest,
      responseSha256,
      usageAuthenticated: committed.has(`sha256:${responseSha256}`),
      verdict: audit?.transcript?.verdict ?? null,
      receiptId: receiptId ?? null,
      responseStatus: response.status,
      completionUsage: completion?.usage ?? null,
      receiptTopLevelKeys: receipt ? Object.keys(receipt) : null,
      receipt,
    },
  };
}

let record = null;
const deadline = Date.now() + 120_000;
for (let round = 0; round < 6 && !record && Date.now() < deadline; round += 1) {
  const candidates = await discoverSessions();
  for (const candidate of candidates.slice(0, 6)) {
    if (Date.now() > deadline) break;
    const result = await requestOnce(candidate);
    if (result.record) { record = result.record; break; }
    console.error(`  ${candidate.model}: ${result.status} ${result.note ?? ''}`);
  }
  if (!record) await sleep(1500);
}
try { await aci.close(); } catch { /* ignore */ }
if (!record) throw new Error('ACI sessions kept going stale or unroutable before a request landed');

const file = `aci-receipt-probe-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(record, null, 2));
console.log(JSON.stringify({
  wrote: file,
  model: record.model,
  verified: record.verdict?.verified === true,
  identityComposeHash: record.identityComposeHash,
  usageAuthenticated: record.usageAuthenticated,
  completionUsage: record.completionUsage,
  receiptTopLevelKeys: record.receiptTopLevelKeys,
  receiptHasUsage: Boolean(record.receipt) && Object.keys(record.receipt).some((k) => /usage|token|cost|price|billing/i.test(k)),
}, null, 2));
