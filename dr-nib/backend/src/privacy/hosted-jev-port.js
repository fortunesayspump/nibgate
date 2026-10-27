import {guestPlanningPolicy} from './guest-planning-policy.js';
import { randomUUID } from 'node:crypto';
import {admitPrivateRunSpend} from './private-run-budget.js';

const URL = 'https://openrouter.ai/api/alpha/decisions';
const MODEL = 'typesafe/jev-1.13';
const SERVED_MODEL = 'typesafe/jev-1.13-20260917';
const INPUT_LIMIT = 32768;
const INPUT_PRICE = 42000n; // micro-USD / million input tokens; output is free.
export const HOSTED_JEV_PROBE_REQUEST = Object.freeze({state:'Public synthetic routing test: 2 + 2 = 4. No user documents, identities or research context.',questions:Object.freeze({check:Object.freeze({type:'noul',instructions:'Is the arithmetic statement correct?'})})});
const unavailable = () => Error('HOSTED_JEV_UNAVAILABLE');
const ceilCost = tokens => (BigInt(tokens) * INPUT_PRICE + 999999n) / 1000000n;
function validate(request) {
    if (!request || Object.keys(request).sort().join(',') !== 'questions,state') throw unavailable();
    const entries = Object.entries(request.questions ?? {});
    if (Array.isArray(request.questions) || entries.length < 1 || entries.length > 16) throw unavailable();
    for (const [id, q] of entries) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !q || !['choice', 'score', 'noul'].includes(q.type) ||
            typeof q.instructions !== 'string' || !q.instructions.length || q.instructions.length > 2000 ||
            Object.keys(q).some(k => !['type', 'instructions', 'criteria'].includes(k))) throw unavailable();
        if (q.type === 'choice') {
            const options = Object.entries(q.criteria ?? {});
            if (Array.isArray(q.criteria) || options.length < 2 || options.length > 20 || options.some(([k,v]) => !/^[a-zA-Z0-9_-]{1,64}$/.test(k) || typeof v !== 'string' || !v.length || v.length > 2000)) throw unavailable();
        } else if (q.type === 'score') {
            if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 20 || q.criteria.some(v => typeof v !== 'string' || !v.length || v.length > 2000)) throw unavailable();
        } else if (q.criteria !== undefined) throw unavailable();
    }
    const payload = JSON.stringify(request);
    if (request.state == null || !['string','object'].includes(typeof request.state) || Buffer.byteLength(payload) > 12000) throw unavailable();
}
function answersFor(questions, answers) {
    if (!answers || typeof answers !== 'object' || Object.keys(answers).sort().join(',') !== Object.keys(questions).sort().join(',')) throw unavailable();
    for (const [id,q] of Object.entries(questions)) {
        const a = answers[id];
        if (a?.type !== q.type) throw unavailable();
        if (q.type === 'noul') {
            if (typeof a.noul !== 'number' || !Number.isFinite(a.noul) || a.noul < 0 || a.noul > 1) throw unavailable();
        } else {
            if (typeof a.confidence !== 'number' || !Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1) throw unavailable();
            const keys = q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_,i) => String(i));
            if (q.type === 'choice' && !keys.includes(a.choice)) throw unavailable();
            if (q.type === 'score' && (typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > keys.length - 1)) throw unavailable();
            const p = a.probabilities;
            if (!p || Object.keys(p).sort().join(',') !== keys.sort().join(',') || Object.values(p).some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) || Math.abs(Object.values(p).reduce((n,v) => n+v,0)-1) > 0.02) throw unavailable();
        }
    }
    return answers;
}
/** Guest-only hosted inference. This is explicitly provider-visible, NOT an
 * attested JEV port. No ordinary Hub, tracing, identity or plaintext DB writes.
 * Runtime activation is separate from this adapter and requires verified ZDR
 * support for the native Decisions route. There is no fallback or retry. */
export function createHostedJevPort({ db, apiKey, monthlyCapMicroUsd, policy, fetchImpl = fetch, diagnosticOnly = false, fundingRequired=false }) {
    if (typeof fundingRequired!=='boolean'||!db || !apiKey || !Number.isSafeInteger(monthlyCapMicroUsd) || monthlyCapMicroUsd < 1 ||
        policy?.contextDisclosure !== 'openrouter-and-typesafe' || (policy?.decisionsZdrRoutingVerified !== true && diagnosticOnly !== true)) throw unavailable();
    return async ({ run, actionId, request, budgetMicroUsd }) => {
        try {
            if(policy.loggingReviewExpiresAtMs!==undefined&&(!Number.isSafeInteger(policy.loggingReviewExpiresAtMs)||Date.now()>=policy.loggingReviewExpiresAtMs))throw unavailable();
            validate(request);
            if (diagnosticOnly && JSON.stringify(request) !== JSON.stringify(HOSTED_JEV_PROBE_REQUEST)) throw unavailable();
            // Snapshot before awaits; callers cannot mutate the approved request.
            const body = JSON.stringify({ model: MODEL, ...request, provider: {
                only: ['TypeSafe'], allow_fallbacks: false, require_parameters: true,
                data_collection: 'deny', zdr: true,
            } });
            const id = randomUUID(), monthKey = new Date().toISOString().slice(0,7), reserved = ceilCost(INPUT_LIMIT);
            await db.$transaction(async tx => {
                // Same monthly admission lock and ledger as confidential generation.
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(648821, 1)::text AS locked`;
                const fresh = await tx.researchRun.findUnique({ where: { id: run.id } });
                if (fresh?.userId !== run.userId || fresh.deletedAt || fresh.metadata?.privacyMode !== 'confidential') throw unavailable();
                const action = await tx.privateActionReceipt.findUnique({ where: { runId_requestId: { runId: run.id, requestId: actionId } } });
                if (action?.status !== 'processing') throw unavailable();
                if (await tx.privateInferenceCall.count({ where: { runId: run.id, actionId } }) >= 48 ||
                    await tx.privateInferenceCall.count({ where: { runId: run.id, actionId, status: 'reserved' } })) throw unavailable();
                const current = await tx.privateInferenceCall.aggregate({ where: { monthKey }, _sum: { committedMicroUsd: true } });
                const legacy = await tx.privateAiBudgetReservation.aggregate({ where: { monthKey }, _sum: { committedMicroUsd: true } });
                if (BigInt(current._sum.committedMicroUsd ?? 0) + BigInt(legacy._sum.committedMicroUsd ?? 0) + reserved > BigInt(monthlyCapMicroUsd)) throw unavailable();
                const billingKind=guestPlanningPolicy(fresh)?'platform':fundingRequired?(budgetMicroUsd===undefined?'platform':'customer'):'owner-test';
                await admitPrivateRunSpend(tx,run.id,reserved,budgetMicroUsd,fundingRequired,billingKind,fresh);
                await tx.privateInferenceCall.create({ data: { id, runId: run.id, actionId, model: MODEL, billingKind,costBasis:'reservation', monthKey, reservedMicroUsd: reserved, committedMicroUsd: reserved, status: 'reserved' } });
            },{timeout:60000,maxWait:10000});
            const response = await fetchImpl(URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
                headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body });
            if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
            // Bound the stream before parsing; never attach raw responses to errors.
            const reader = response.body.getReader(), chunks = []; let size = 0;
            try { for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.length; if (size > 256 * 1024) throw unavailable(); chunks.push(value); } }
            finally { await reader.cancel().catch(() => {}); }
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8')), usage = data.usage;
            const sent = JSON.parse(body);
            if (data.model !== SERVED_MODEL || data.provider !== 'TypeSafe' || typeof data.id !== 'string' || !/^[A-Za-z0-9_:.-]{1,200}$/.test(data.id) ||
                !usage || !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 1 || usage.input_tokens > INPUT_LIMIT ||
                !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0 || usage.output_tokens > 32768 ||
                typeof usage.cost !== 'number' || !Number.isFinite(usage.cost) || usage.cost < 0 || usage.cost > Number(reserved)/1000000) throw unavailable();
            const answers = answersFor(sent.questions, data.answers);
            const cost = BigInt(Math.ceil(usage.cost * 1000000));
            if (cost > reserved) throw unavailable();
            // 'accounted' is provider-reported usage, never an attested receipt.
            await db.privateInferenceCall.update({ where: { id }, data: { status: 'accounted',costBasis:'provider-reported',usageEvidence:{format:'drnib-private-usage-v1',inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,costMicroUsd:Number(cost),providerRequestId:data.id}, committedMicroUsd: cost } });
            return { model: data.model, provider: data.provider, privacy: 'hosted-provider-visible', answers, costMicroUsd: Number(cost) };
        } catch (error) {
            if(['PRIVATE_RUN_BUDGET_INVALID','PRIVATE_RUN_BUDGET_EXHAUSTED','PRIVATE_RUN_BUDGET_CLOSED','PRIVATE_RUN_FUNDING_REQUIRED'].includes(error?.message))throw Error(error.message);
            throw unavailable();
        }
    };
}
