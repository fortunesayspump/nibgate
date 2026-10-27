'use client';
import { isGuestRun, readGuestPending, writeGuestPending, lockGuestAction } from './dr-nib-guest-planning';
import { privateConnectionProgress } from './dr-nib-private-connection';
import { openGuestSession, proveGuestKey } from './dr-nib-private-api';
import { base64ToBytes, bytesToBase64, bytesToHex, equalHex, freshId, freshNonce, proofDigest, recipientId, sealSource } from './dr-nib-private-crypto';
import { configuredPrivateVerification, verifyPrivateSession } from './dr-nib-private-verification';
import { openPrivateObject, type PrivateObjectEnvelope } from './dr-nib-private-objects';
import { privateProjectSecrets, privateRecordRequest } from './dr-nib-private-records';
const flights = new Map<string, Promise<any>>();
/** Reconnect retrieves the same encrypted receipt; an unknown attempt is never
 * silently replaced by another paid request. No private input enters storage. */
export function privateAction(runId: string, action: string, args: Record<string, unknown> = {}): Promise<any> {
    if (flights.has(runId)&&action!=='recover')
        return Promise.reject(Error('A private action is already running.'));
    const flight = (async () => await isGuestRun(runId) ? lockGuestAction(runId, () => perform(runId, action, args)) : perform(runId, action, args))();
    flights.set(runId, flight);
    void flight.finally(() => {if(flights.get(runId)===flight){privateConnectionProgress(runId,null);flights.delete(runId)}}).catch(() => { });
    return flight;
}
async function perform(runId: string, action: string, args: Record<string, unknown>) {
    const verification = configuredPrivateVerification();
    if (!verification)
        throw Error('The reviewed private worker is not configured. No ordinary processing was started.');
    const access = await privateProjectSecrets(runId), { tenantId, vault } = access;
    const secrets = { workerStateKey: access.secrets.workerStateKey.slice(), reportKeySeed: access.secrets.reportKeySeed.slice() };
    try {
    const pendingKey = `drnib-private-pending-v1:${tenantId}:${runId}`;
    const fingerprint = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ action, args })))));
    const guest = await isGuestRun(runId);
    const pendingWrite = async (value: string | null) => {
        if (guest) await writeGuestPending(runId, value);
        else if (value === null) localStorage.removeItem(pendingKey);
        else localStorage.setItem(pendingKey, value);
    };
    const pending = guest ? await readGuestPending(runId) : localStorage.getItem(pendingKey);
    const recoveryId=action==='recover'?args.requestId:null;
    if(action==='recover'&&(typeof recoveryId!=='string'||!/^[0-9a-f-]{36}$/i.test(recoveryId)))throw Error('Invalid private recovery request.');
    let requestId = typeof recoveryId==='string'?recoveryId:freshId();
    async function uncertain(result:any):Promise<never> {
        let detail='',knownFailure=false;
        if(result.requestId===requestId&&result.envelope){
            const bytes=await openPrivateObject(secrets.workerStateKey,{tenantId,vaultId:vault.vaultId,runId,objectId:requestId,revision:1,purpose:'event'},result.envelope);
            try {
                const failure=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),code=failure.error;
                const messages:Record<string,string>={
                    PRIVATE_GUEST_PLAN_POLICY_CHANGED:'The reviewed models or pricing policy changed. Review the configuration and explicitly generate a new plan.',
                    PRIVATE_GUEST_PLAN_EXPIRED:'This guest plan expired. Review the saved question and explicitly create a new plan before funding.',
                    PRIVATE_GUEST_PLAN_CHANGED:'The plan inputs changed. Review and explicitly replan before funding.',
                    PRIVATE_GUEST_QUOTE_CHANGED:'The research quote changed. Review the current quote and explicitly replan before funding.',
                    PRIVATE_GUEST_SESSION_CLOSED:'This guest session is closed or expired. Its encrypted draft remains on this device; sign in to save it.',
                    PRIVATE_GUEST_LIMIT:'The guest planning limit has been reached. Sign in to save the existing draft. No automatic retry was started.',PRIVATE_EVIDENCE_REPAIR_REQUIRED:'Research did not obtain usable evidence. Saved work and escrow remain open for repair; no replacement purchase or refund was started automatically.',PRIVATE_REPORT_REPAIR_REQUIRED:'The report check needs further repair. Saved work and escrow remain open; recorded model results will not be purchased again by checking saved work.',PRIVATE_STORAGE_TRANSACTION_TIMEOUT:'Private storage timed out. Saved work needs a journal check before resuming.',PRIVATE_CHECKPOINT_UNCERTAIN:'A saved operation has no confirmed durable result.',PRIVATE_RUN_BUDGET_CLOSED:'This project budget is closed for settlement. Saved reports remain available.',PRIVATE_RUN_FUNDING_REQUIRED:'Fund this project before starting paid private research.',PRIVATE_RUN_BUDGET_INVALID:'The project budget is invalid.',PRIVATE_RUN_BUDGET_EXHAUSTED:'The remaining project budget cannot admit this call, including any uncertain usage.',PRIVATE_AGENT_REPORT_DECLINED:'JEV declined report generation from the available evidence. The action stopped without bypassing its decision.',HOSTED_JEV_UNAVAILABLE:'JEV did not complete a decision under the required privacy and budget controls.',PRIVATE_AGENT_INVALID:'The research agent proposed an invalid or disallowed action.',PRIVATE_AGENT_LIMIT:'The research agent reached its bounded decision limit.',PRIVATE_INTAKE_INVALID:'The model returned invalid intake questions.',PRIVATE_MODEL_JSON_INVALID:'The model returned invalid structured output.',PRIVATE_MODEL_OUTPUT_TRUNCATED:'The model reached its output limit.',PRIVATE_WORKFLOW_CAP:'The private test allowance cannot admit another call.',PRIVATE_ACTION_UNAVAILABLE:'The worker could not finalize the action.',
                    PHALA_PRIVATE_AI_UNAVAILABLE:'The confidential AI connection or its required verification failed.',
                    PHALA_PRIVATE_AI_REQUEST_FAILED:'The confidential AI request did not satisfy the approved policy.',
                    PHALA_PRIVATE_AI_ATTESTATION_FAILED:'The confidential AI gateway identity could not be verified.',
                    PHALA_PRIVATE_AI_SESSION_FAILED:'A current verified model-serving session was unavailable.',
                    PHALA_PRIVATE_AI_COMPLETION_FAILED:'The confidential AI completion request failed.',
                    PHALA_PRIVATE_AI_SESSION_EXPIRED:'The gateway could not serve this request through the pinned verified model sessions.',
                    PHALA_PRIVATE_AI_REQUEST_REJECTED:'The confidential AI gateway rejected the request parameters.',
                    PHALA_PRIVATE_AI_CREDENTIAL_REJECTED:'The confidential AI gateway rejected its service credentials.',
                    PHALA_PRIVATE_AI_RATE_LIMITED:'The confidential AI gateway is rate-limited. Saved work is preserved. Requests wait through the provider cooldown; an earlier uncertain call must be reconciled before replay.',
                    PHALA_PRIVATE_AI_UPSTREAM_UNAVAILABLE:'The confidential model-serving upstream was unavailable.',
                    PHALA_PRIVATE_AI_RECEIPT_FAILED:'The AI response receipt could not be verified.',
                    PRIVATE_MODEL_OUTPUT_INVALID:'The model returned an invalid completion.',
                    PRIVATE_PLAN_INVALID:'The model returned an invalid plan.',
                    PRIVATE_VERIFICATION_INVALID:'Report claim verification failed.',
                    PRIVATE_VERIFICATION_SCHEMA_INVALID:'The source checker returned an invalid judgment format.',
                    PRIVATE_VERIFICATION_SOURCE_INVALID:'A source-check judgment referenced an invalid citation.',
                    PRIVATE_VERIFICATION_QUOTE_INVALID:'A claimed supporting quote did not match the supplied evidence exactly.',
                    PRIVATE_VERIFICATION_INSUFFICIENT:'The source checker could not support any sampled claim.',
                    PRIVATE_UNSUPPORTED_REPORT:'A sampled report claim was not supported by its sources.',
                    PRIVATE_REPORT_LENGTH_UNMET:'The generated report did not meet the requested length.',
                    PRIVATE_WEB_UNAVAILABLE:'Public search did not return usable evidence within its deadline.',
                    PRIVATE_REPORT_GENERATION_FAILED:'Report generation did not complete.',
                    PRIVATE_WORKFLOW_USAGE_INVALID:'The verified usage did not satisfy the private accounting policy.',
                    PRIVATE_WORKFLOW_USAGE_UNPRICED:'The provider did not return a confirmable price. Usage remains unresolved and has not become a finalized customer charge.',
                    PRIVATE_WORKFLOW_PRICE_OVERAGE:'The verified cost exceeded its reserved allowance.',
                    PRIVATE_BUDGET_TOO_SMALL:'The configured budget cannot admit this report.',
                    PRIVATE_SOURCE_REQUIRED:'An uploaded source is required.',
                    PRIVATE_SOURCE_INVALID:'An uploaded source could not be validated or extracted.',
                    PRIVATE_SOURCE_LIMIT:'The uploaded sources exceed the private processing limit.'};
                detail=messages[code]??'The protected action failed.';
                const operations:Record<string,string>={infer:'model request',judge:'JEV judgment',parse:'source extraction',code:'private calculation',terminal:'private terminal command','owner-answer':'owner approval','public-retrieval':'public retrieval'};
                if(code==='PRIVATE_CHECKPOINT_UNCERTAIN'&&operations[failure.operation])detail+=' Waiting for the '+operations[failure.operation]+' result; no replay was started.';
                knownFailure=result.state==='failed'&&failure.outcome==='failed';
                if(code==='PRIVATE_UNSUPPORTED_REPORT'&&Array.isArray(failure.verification?.rejectedClaims)){
                    const rejected=failure.verification.rejectedClaims.slice(0,3).map((claim:any)=>typeof claim?.text==='string'?claim.text.slice(0,2000):'').filter(Boolean);
                    if(rejected.length)detail+=' Rejected claims: '+rejected.join(' | ');
                }
            } finally {bytes.fill(0);}
        }
        if(knownFailure){await pendingWrite(null);throw Error(`${detail} The action stopped with no unresolved model charge in this action. Review the project before submitting another action.`);}
        throw Error(`${detail?detail+' ':''}The private action has an uncertain outcome. No duplicate model call was started.`);
    }
    async function decode(result: any) {
        if (result?.requestId !== requestId || result.state !== 'complete')
            throw Error('Private action is still pending. Check again before starting another action.');
        const bytes = await openPrivateObject(secrets.workerStateKey, { tenantId, vaultId: vault.vaultId, runId, objectId: requestId, revision: 1, purpose: 'event' }, result.envelope as PrivateObjectEnvelope);
        try {
            const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
            await pendingWrite(null);
            return value;
        }
        finally {
            bytes.fill(0);
        }
    }
    if (pending&&action!=='recover') {
        const prior = JSON.parse(pending);
        requestId = prior.requestId;
        const result = await privateRecordRequest(`/runs/${runId}/actions/${requestId}`);
        if(result.state==='cancelled'){
            if(action!=='export')throw Error('This private run was ended. No new model call was started. Open its receipt to check settlement.');
            // Cancellation fences the old request in the worker. Only a
            // read-only export may replace this device's pending pointer.
            await pendingWrite(null);
            requestId=freshId();
        }
        else {
        const retryReadOnlyExport=action==='export'&&prior.fingerprint===fingerprint&&result.state==='uncertain';
        if(!retryReadOnlyExport&&(result.state==='uncertain'||result.state==='failed'))return await uncertain(result);
        if (result.state === 'complete') {
            const value = await decode(result);
            if (prior.fingerprint === fingerprint)
                return value;
            throw Error('The previous private action finished. Refresh before continuing.');
        }
        if (!retryReadOnlyExport&&(prior.fingerprint !== fingerprint || result.state !== 'not_started'))
            throw Error('The previous private action has an unresolved outcome. No new model call was started.');
        }
    }
    if(action==='recover'){
        const result=await privateRecordRequest(`/runs/${runId}/actions/${requestId}`);
        if(result.state==='complete')return await decode(result);
        if(result.state==='failed'||result.state==='uncertain'&&result.recoveryAvailable!==true)return await uncertain(result);
        if(!['processing','uncertain'].includes(result.state)||result.recoveryAvailable!==true)throw Error('The original worker still owns this action. Refresh before reconnecting; no duplicate call was started.');
    }
    const nonce = freshNonce(), session = await openGuestSession(runId, bytesToHex(nonce));
    if (!equalHex(session.clientNonce, bytesToHex(nonce)))
        throw Error('Private worker nonce mismatch.');
    const guestKey = base64ToBytes(session.recipientPublicKey, 65, 65);
    if (!equalHex(session.recipientId, await recipientId(guestKey)))
        throw Error('Private worker key mismatch.');
    await verifyPrivateSession({ mode: verification, session, nonce, publicKey: guestKey });
    const challenge = freshNonce(), proof = await proveGuestKey(runId, session.sessionId, await sealSource(guestKey, { tenantId, runId, objectId: freshId(), revision: 1, purpose: 'source', recipientId: session.recipientId }, challenge)) as any;
    if (proof?.verified !== true || proof.sessionId !== session.sessionId || !equalHex(proof.recipientId, session.recipientId) || !equalHex(proof.clientNonce, bytesToHex(nonce)) || !equalHex(proof.challengeDigest, await proofDigest(session.sessionId, challenge)))
        throw Error('Private worker key possession failed.');
    privateConnectionProgress(runId, null);
    const plaintext = new TextEncoder().encode(JSON.stringify({ sessionId: session.sessionId, requestId, vaultId: vault.vaultId, action, args, stateKeyBase64: bytesToBase64(secrets.workerStateKey) }));
    try {
        const sourceEnvelope = await sealSource(guestKey, { tenantId, runId, objectId: requestId, revision: 1, purpose: 'source', recipientId: session.recipientId }, plaintext);
        // Store intent before dispatch; a storage failure prevents the paid call.
        await pendingWrite(JSON.stringify({ requestId, fingerprint }));
        let result: any;
        try {
            result = await privateRecordRequest(`/sessions/${session.sessionId}/action`, { method: 'POST', body: JSON.stringify({ runId, sourceEnvelope }), signal: AbortSignal.timeout(200000) });
        } catch {
            // A lost HTTP reply is not permission to repeat inference. Read
            // the durable receipt; the guest may still be completing the job.
            result = await privateRecordRequest(`/runs/${runId}/actions/${requestId}`);
        }
        for (let attempt = 0; result?.state === 'processing' && attempt < 120; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            result = await privateRecordRequest(`/runs/${runId}/actions/${requestId}`);
        }
        if(result?.state==='cancelled')throw Error('This private run was ended. No new model call was started. Open its receipt to check settlement.');
        if(result?.state==='not_started')throw Error('The private action did not start. You can retry this same action.');
        if(result?.state==='uncertain'||result?.state==='failed')return await uncertain(result);
        return await decode(result);
    }
    finally {
        plaintext.fill(0);
    }
    } finally {secrets.workerStateKey.fill(0);secrets.reportKeySeed.fill(0);}
}
