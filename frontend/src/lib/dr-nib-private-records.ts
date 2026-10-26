import {validDrNibActiveWork} from './dr-nib-work-duration';
import {privateRecordFetch} from './dr-nib-private-read';
import {privateRecoveryRoot} from './dr-nib-private-checkpoint-recovery';
import {requirePrivateResearchInputs} from './dr-nib-private-funding';
import {mergePrivateProgressRows} from './dr-nib-private-progress';
import {privateJournalQuestions,mergePrivateQuestionHistory} from './dr-nib-question-history';
import {samePrivateVaultEnvelope, rewrapPrivateProjectKeys, privateVaultEnrollmentAction} from './dr-nib-private-vault';
import { createPrivateVault, recoverPrivateVault, recoverPrivateVaultWithPassword, recoverPrivateVaultWithPasskey, createPrivatePasskeyRecord, createPrivateProjectKeys, openPrivateProjectKeys, type PrivateVault, type PrivateProjectSecrets } from './dr-nib-private-vault';
import { createPrivatePasskey, readPrivatePasskey } from './dr-nib-private-passkey';
import { getEnrolledVault, addEnrolledVault, updateEnrolledVault, promoteEnrolledVault, getEnrolledProject, addEnrolledProject } from './dr-nib-private-vault-store';
import { sealPrivateObject, openPrivateObject, objectBytesToBase64, objectBase64ToBytes, type PrivateObjectEnvelope, type PrivateObjectPurpose } from './dr-nib-private-objects';
const BASE = '/drnib-private-api/v1/private';
type ProjectAccess = {
    tenantId: string;
    vault: PrivateVault;
    secrets: PrivateProjectSecrets;
};
const vaultFlights = new Map<string, Promise<PrivateVault>>(), projectFlights = new Map<string, Promise<ProjectAccess>>();
// Cache only the display questions, keyed by authenticated object revision.
// Full decrypted journals are discarded after selecting question/answer fields.
const questionHistoryFlights=new Map<string,Promise<any[]>>();
export { setPrivateVaultPrompt, type VaultPrompt } from './dr-nib-private-vault-prompt';
import { askPrivateVaultPrompt as ask } from './dr-nib-private-vault-prompt';
export const privateFundingEnabled = () => process.env.NEXT_PUBLIC_DRNIB_PRIVATE_FUNDED === 'true';
export const privateBuildEnabled = () => process.env.NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL === 'true';
export async function privateRecordRequest(path: string, options: RequestInit = {}, allowMissing = false): Promise<any> {
    let response: Response;
    try {
        response = await privateRecordFetch(BASE + path, { ...options, credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'content-type': 'application/json', ...options.headers }, signal: options.signal ?? AbortSignal.timeout(30000) });
    }
    catch {
        throw Error('Private project connection failed. Retry without replacing its keys.');
    }
    if (allowMissing && response.status === 404)
        return null;
    if (!response.ok) {
        let accountUnavailable=false;
        if(response.status===503){const text=await response.text();if(text.length<1024){try{accountUnavailable=JSON.parse(text).code==='account_unavailable';}catch{}}}
        const e = new Error(response.status === 401 ? 'Sign in to Nibgate to open your private projects.' : response.status === 409 ? 'This private project changed on another device. Refresh before retrying.' : accountUnavailable ? 'The Hub sign-in check is temporarily unavailable. Reopen the saved project to check its latest progress before starting another action.' : 'Private project storage is unavailable. Check the saved project before starting another action.');
        Object.assign(e, { status: response.status });
        throw e;
    }
    const body = await response.text();
    if (body.length > 5 * 1024 * 1024)
        throw Error('Invalid private project response.');
    return JSON.parse(body);
}
const codeFor = (secret: Uint8Array) => Array.from(secret, b => b.toString(16).padStart(2, '0')).join('');
function secretFor(code: string) { const hex = code.replace(/[\s-]/g, ''); if (!/^[0-9a-f]{64}$/i.test(hex))
    throw Error('Enter the complete private recovery code.'); return Uint8Array.from(hex.match(/../g)!, v => parseInt(v, 16)); }
export async function privateTenantId(): Promise<string> {
    let result:any;
    try { result=await privateRecordRequest('/identity'); }
    catch(error){if((error as {status?:number})?.status===404)throw Error('This signed-in account is not enabled for the private test. No document or project key was sent.');throw error;}
    if(typeof result?.tenantId!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(result.tenantId))throw Error('Invalid private account.');
    return result.tenantId;
}
/** Read-only recovery readiness. Never unlocks, rotates, or exports a key. */
export async function privateRecoveryAvailability(): Promise<'available' | 'available-legacy' | 'needs-code' | 'no-vault'> {
    const tenantId = await privateTenantId();
    const remote = await privateRecordRequest('/vault', {}, true);
    if (!remote) return 'no-vault';
    const local = await getEnrolledVault(tenantId, remote.vaultId);
    if (!local) return 'needs-code';
    if (!local.recoveryConfirmed || local.vault.tenantId !== tenantId ||
        local.vault.vaultId !== local.vaultId || local.vault.key.extractable)
        return 'needs-code';
    if (privateVaultEnrollmentAction(local, remote) === 'recover') return 'needs-code';
    return remote.recoveryEnvelope.version === 2 ? 'available' : 'available-legacy';
}
export async function privatePasskeyStatus(): Promise<boolean> {
    const remote = await privateRecordRequest('/vault', {}, true);
    return !!remote?.passkey;
}
export type PrivateVaultFolder = { vaultId: string; active: boolean; createdAt: string; hasPasskey: boolean };
export async function listPrivateVaults(): Promise<PrivateVaultFolder[]> {
    const result = await privateRecordRequest('/vaults');
    if (!Array.isArray(result?.vaults) || result.vaults.length > 10 ||
        result.vaults.some((row: any) => typeof row?.vaultId !== 'string' ||
            typeof row.active !== 'boolean' || typeof row.createdAt !== 'string' || typeof row.hasPasskey !== 'boolean'))
        throw Error('Invalid private vault list.');
    return result.vaults;
}
export async function switchPrivateVault(vaultId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(vaultId)) throw Error('Invalid private vault.');
    const saved = await privateRecordRequest('/vaults/switch', { method: 'POST', body: JSON.stringify({ vaultId }) });
    if (saved?.vaultId !== vaultId) throw Error('Could not confirm the selected vault. Refresh and retry.');
}
/** A new folder gets a new random key; existing folders and ciphertext remain. */
export async function createNewPrivateVault(): Promise<void> {
    if (!privateBuildEnabled()) throw Error('Private vaults are unavailable.');
    const tenantId = await privateTenantId();
    if (!navigator.locks) throw Error('This browser cannot safely create a vault. Use a current browser.');
    await navigator.locks.request(`drnib-vault-replacement:${tenantId}`, async () => {
        const previous = await privateRecordRequest('/vault');
        const password = await ask({ mode: 'set-password', tenantId });
        const created = await createPrivateVault(tenantId, undefined, password.secret);
        try {
            await ask({ mode: 'enroll', tenantId, recoveryCode: codeFor(created.recoverySecret) });
            let saved;
            try {
                saved = await privateRecordRequest('/vaults', { method: 'POST', body: JSON.stringify({
                    expectedVaultId: previous.vaultId, expectedRevision: previous.revision,
                    newVaultId: created.vault.vaultId, recoveryEnvelope: created.recoveryEnvelope,
                }) });
            } catch (error) {
                const current = await privateRecordRequest('/vault');
                if (current.vaultId !== created.vault.vaultId || current.revision !== 1 ||
                    !samePrivateVaultEnvelope(current.recoveryEnvelope, created.recoveryEnvelope)) throw error;
                saved = current;
            }
            await addEnrolledVault({ tenantId, vaultId: created.vault.vaultId, vault: created.vault,
                recoveryEnvelope: created.recoveryEnvelope, revision: saved.revision, recoveryConfirmed: true });
        } finally { created.recoverySecret.fill(0); }
    });
}
/** Explicit owner action. A passkey only becomes a recovery method after its
 * PRF unwrap is tested and its ciphertext wrapper is committed. */
export async function enrollPrivatePasskey(password: string): Promise<void> {
    if (!privateBuildEnabled()) throw Error('Private recovery is unavailable.');
    const tenantId = await privateTenantId();
    if (!navigator.locks) throw Error('This browser cannot safely enroll a recovery passkey. Use a current browser.');
    await navigator.locks.request(`drnib-vault-replacement:${tenantId}`, async () => {
        const vault = await unlockPrivateVault(tenantId);
        const remote = await privateRecordRequest('/vault');
        const local = await getEnrolledVault(tenantId, remote.vaultId);
        if (!local || local.vaultId !== vault.vaultId || local.pendingReplacement ||
            remote.revision !== local.revision || !samePrivateVaultEnvelope(remote.recoveryEnvelope, local.recoveryEnvelope))
            throw Error('Private projects changed. Refresh before adding a passkey.');
        if (remote.recoveryEnvelope.version !== 2) throw Error('Set a private-project password before adding a passkey.');
        // Fail a wrong password before creating an orphaned authenticator credential.
        await recoverPrivateVaultWithPassword(password, remote.recoveryEnvelope, { tenantId, vaultId: vault.vaultId });
        const created = await createPrivatePasskey(tenantId, vault.vaultId);
        let record;
        try { record = await createPrivatePasskeyRecord(password, remote.recoveryEnvelope,
            { tenantId, vaultId: vault.vaultId }, created.credentialId, created.salt, created.output); }
        finally { created.output.fill(0); }
        let saved;
        try {
            saved = await privateRecordRequest('/vault', { method: 'PUT', body: JSON.stringify({
                vaultId: vault.vaultId, expectedRevision: remote.revision,
                recoveryEnvelope: remote.recoveryEnvelope, passkey: record,
            }) });
        } catch (error) {
            // A lost response must not prompt another passkey creation if the
            // exact wrapper committed. Reconcile without ever reading a secret.
            const current = await privateRecordRequest('/vault');
            if (current.revision !== remote.revision + 1 ||
                !samePrivateVaultEnvelope(current.recoveryEnvelope, remote.recoveryEnvelope) ||
                current.passkey?.credentialId !== record.credentialId ||
                current.passkey?.salt !== record.salt ||
                current.passkey?.envelope?.iv !== record.envelope.iv ||
                current.passkey?.envelope?.ciphertext !== record.envelope.ciphertext) throw error;
            saved = current;
        }
        await updateEnrolledVault({ ...local, revision: saved.revision });
    });
}
export async function unlockPrivateVault(tenantId: string): Promise<PrivateVault> {
    const remote = await privateRecordRequest('/vault', {}, true);
    const flightKey = `${tenantId}:${remote?.vaultId ?? 'new'}`;
    const prior = vaultFlights.get(flightKey);
    if (prior)
        return prior;
    const flight = (async () => {
        const local = remote ? await getEnrolledVault(tenantId, remote.vaultId) : undefined;
        if (local) {
            const selection = privateVaultEnrollmentAction(local, remote);
            const pending = local.pendingReplacement;
            if (selection === 'promote' && pending) {
                const { replacementProjects: _projects, ...promoted } = pending;
                await promoteEnrolledVault(promoted);
                return promoted.vault;
            }
            if (selection === 'current') {
                if (remote.revision !== local.revision) await updateEnrolledVault({ ...local, revision: remote.revision });
                return local.vault;
            }
            // Another enrolled device replaced recovery. Old wrappers cannot be
            // replayed into the new generation; import with the new saved code.
        }
        if (remote) {
            const credential = await ask({ mode: 'recover', tenantId, hasPassword: remote.recoveryEnvelope?.version === 2,
                hasPasskey: !!remote.passkey });
            let vault: PrivateVault;
            if (credential.method === 'password') {
                vault = await recoverPrivateVaultWithPassword(credential.secret, remote.recoveryEnvelope, { tenantId, vaultId: remote.vaultId });
            } else if (credential.method === 'passkey') {
                if (!remote.passkey) throw Error('No recovery passkey is enrolled for this vault.');
                const output = await readPrivatePasskey(remote.passkey, tenantId, remote.vaultId);
                try { vault = await recoverPrivateVaultWithPasskey(output, remote.passkey, { tenantId, vaultId: remote.vaultId }); }
                finally { output.fill(0); }
            } else {
                const secret = secretFor(credential.secret);
                try { vault = await recoverPrivateVault(secret, remote.recoveryEnvelope, { tenantId, vaultId: remote.vaultId }); }
                finally { secret.fill(0); }
            }
            await promoteEnrolledVault({ tenantId, vaultId: vault.vaultId, vault, recoveryEnvelope: remote.recoveryEnvelope, revision: remote.revision, recoveryConfirmed: true });
            return vault;
        }
        const password = await ask({ mode: 'set-password', tenantId });
        const created = await createPrivateVault(tenantId, undefined, password.secret);
        try {
            const code = codeFor(created.recoverySecret);
            await ask({ mode: 'enroll', tenantId, recoveryCode: code });
            const saved = await privateRecordRequest('/vault', { method: 'PUT', body: JSON.stringify({ vaultId: created.vault.vaultId, expectedRevision: 0, recoveryEnvelope: created.recoveryEnvelope, passkey: null }) });
            await addEnrolledVault({ tenantId, vaultId: created.vault.vaultId, vault: created.vault, recoveryEnvelope: created.recoveryEnvelope, revision: saved.revision, recoveryConfirmed: true });
            return created.vault;
        }
        finally {
            created.recoverySecret.fill(0);
        }
    })();
    vaultFlights.set(flightKey, flight);
    void flight.finally(() => vaultFlights.delete(flightKey)).catch(() => { });
    return flight;
}
export type PrivateObjectDescriptor = {
    objectId: string;
    kind: string;
    vaultId: string;
    revision: number;
};
export async function listPrivateObjects(runId: string): Promise<PrivateObjectDescriptor[]> { const value = await privateRecordRequest(`/runs/${runId}/objects`); if (!Array.isArray(value?.objects))
    throw Error('Invalid private object list.'); return value.objects; }
export async function privateProjectSecrets(runId: string): Promise<ProjectAccess> {
    const tenantId = await privateTenantId(), key = `${tenantId}:${runId}`;
    const prior = projectFlights.get(key);
    if (prior)
        return prior;
    const flight = (async () => {
        // Independent authenticated reads can share the broker's in-flight
        // Hub check. Keep every ownership/revision/envelope check below;
        // no completed authorization or unwrapped key is cached here.
        const vault = await unlockPrivateVault(tenantId);
        const [local,remote] = await Promise.all([
            getEnrolledProject(tenantId,runId), privateRecordRequest(`/runs/${runId}/objects/${runId}`,{},true),
        ]);
        if (remote) {
            if (remote.kind !== 'project-keys' || remote.vaultId !== vault.vaultId || remote.revision !== 1)
                throw Error('Invalid private project key.');
            const secrets = await openPrivateProjectKeys(vault, runId, remote.envelope);
            if (local && !samePrivateVaultEnvelope(local.envelope,remote.envelope))
                throw Error('Private project key changed.');
            if (!local)
                await addEnrolledProject({ tenantId, runId, vaultId: vault.vaultId, envelope: remote.envelope });
            return { tenantId, vault, secrets };
        }
        throw Error('Private project key is missing from storage. Recovery is required; no replacement key was created.');
    })();
    projectFlights.set(key, flight);
    try {
        return await flight;
    }
    finally {
        projectFlights.delete(key);
    }
}
export async function savePrivateObject(runId: string, objectId: string, purpose: PrivateObjectPurpose, value: unknown, expectedRevision = 0) {
    const { tenantId, vault, secrets } = await privateProjectSecrets(runId);
    const envelope = await sealPrivateObject(secrets.workerStateKey, { tenantId, vaultId: vault.vaultId, runId, objectId, purpose, revision: expectedRevision + 1 }, new TextEncoder().encode(JSON.stringify(value)));
    return privateRecordRequest(`/runs/${runId}/objects/${objectId}`, { method: 'PUT', body: JSON.stringify({ vaultId: vault.vaultId, kind: purpose, expectedRevision, envelope }) });
}
export async function readPrivateObject(runId: string, objectId: string, purpose: PrivateObjectPurpose) {
    // Both reads are authenticated independently. Fetch ciphertext while the
    // vault/project keys are checked instead of waiting an extra Hub round trip.
    const [{tenantId,vault,secrets},stored]=await Promise.all([
        privateProjectSecrets(runId),privateRecordRequest(`/runs/${runId}/objects/${objectId}`),
    ]);
    if (stored.kind !== purpose || stored.vaultId !== vault.vaultId)
        throw Error('Private object identity changed.');
    const bytes = await openPrivateObject(secrets.workerStateKey, { tenantId, vaultId: vault.vaultId, runId, objectId, purpose, revision: stored.revision }, stored.envelope as PrivateObjectEnvelope);
    try {
        return { revision: stored.revision, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
    }
    finally {
        bytes.fill(0);
    }
}
export async function uploadPrivateSource(runId: string, file: File, onProgress: (n: number) => void) {
    if (!/\.(pdf|docx|xlsx|csv|txt|md|png|jpg|jpeg|webp)$/i.test(file.name) || file.size < 1 || file.size > 2 * 1024 * 1024)
        throw Error('Choose a supported source file no larger than 2 MB.');
    onProgress(0);
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
        const objectId = crypto.randomUUID();
        await savePrivateObject(runId, objectId, 'source', { name: file.name, bytes: file.size, contentBase64: objectBytesToBase64(bytes) });
        const saved=await readPrivateObject(runId,objectId,'source');
        if(saved.value.name!==file.name||saved.value.bytes!==file.size||saved.value.contentBase64!==objectBytesToBase64(bytes))throw Error('The encrypted upload could not be verified. Refresh your sources before retrying.');
        onProgress(100);
        return { id: objectId };
    }
    finally {
        bytes.fill(0);
    }
}
export async function listPrivateSources(runId: string) {
    const [objects, manifest] = await Promise.all([listPrivateObjects(runId), getPrivateManifest(runId)]), sources = [];
    for (const item of objects.filter(o => o.kind === 'source')) {
        const { value } = await readPrivateObject(runId, item.objectId, 'source');
        const bytes=objectBase64ToBytes(value.contentBase64,2*1024*1024);
        try{if(bytes.length!==value.bytes||bytes.length<1||typeof value.name!=='string'||!value.name.length)throw Error('Invalid encrypted source.');}finally{bytes.fill(0);}
        sources.push({ id: item.objectId, name: value.name, bytes: value.bytes, characters: 0, pages: null, warnings: [], url: null, originalUrl: null, encrypted: true });
    }
    return { sources, storageReady: true, editable: ['intake', 'intake-done', 'planned'].includes(manifest.value.status), maxFiles: 5, maxBytes: 2 * 1024 * 1024 };
}
export async function privateSourceFile(runId: string, objectId: string): Promise<File> { const { value } = await readPrivateObject(runId, objectId, 'source'); const bytes = objectBase64ToBytes(value.contentBase64, 2 * 1024 * 1024); if (bytes.length !== value.bytes || typeof value.name !== 'string')
    throw Error('Invalid encrypted source.'); return new File([bytes as BlobPart], value.name); }
export async function removePrivateSource(runId: string, objectId: string) { return privateRecordRequest(`/runs/${runId}/objects/${objectId}`, { method: 'DELETE' }); }
export async function createEncryptedProject(topic: string) {
    if (typeof topic !== 'string' || topic.trim().length < 3 || topic.length > 1000)
        throw Error('Enter a research question of 3–1,000 characters.');
    const tenantId = await privateTenantId();
    await unlockPrivateVault(tenantId);
    // Capture key and generation from one durable read. Never pair an old
    // in-flight key with a freshly read replacement generation.
    const active = await privateRecordRequest('/vault');
    const enrollment = await getEnrolledVault(tenantId, active.vaultId);
    if (!enrollment) throw Error('Private vault enrollment is unavailable.');
    const vault = enrollment.vault, id = crypto.randomUUID(), manifestId = crypto.randomUUID();
    const project = await createPrivateProjectKeys(vault, id), now = new Date().toISOString();
    const value = { id, title: topic.trim().slice(0, 160), description: '', brief: { topic: topic.trim(), liveWeb: false }, status: 'intake', questions: [], intake: [], plan: null, createdAt: now, updatedAt: now, version: 1 };
    const manifestEnvelope = await sealPrivateObject(project.secrets.workerStateKey, { tenantId, vaultId: vault.vaultId, runId: id, objectId: manifestId, purpose: 'manifest', revision: 1 }, new TextEncoder().encode(JSON.stringify(value)));
    await privateRecordRequest('/projects', { method: 'POST', body: JSON.stringify({ id, vaultId: vault.vaultId, expectedVaultRevision: enrollment.revision, manifestId, manifestEnvelope, projectKeysEnvelope: project.envelope }) });
    await addEnrolledProject({ tenantId, runId: id, vaultId: vault.vaultId, envelope: project.envelope });
    return value;
}
export async function getPrivateManifest(runId: string, includeProgress = false) {
    const objects = await listPrivateObjects(runId), manifest = objects.find(o => o.kind === 'manifest');
    if (!manifest) throw Error('Private project manifest is missing.');
    const out = await readPrivateObject(runId, manifest.objectId, 'manifest');
    if (includeProgress) {
        const activity = await privateRecordRequest(`/runs/${runId}/actions`, {}, true);
        const terminal=['complete','ended','failed'].includes(out.value.status);
        if(!terminal&&['processing','uncertain'].includes(activity?.state))out.value.metadata={...out.value.metadata,privateActiveRequestId:activity.requestId};
        if(!terminal&&['processing','uncertain'].includes(activity?.state)&&activity.recoveryAvailable===true)out.value.metadata={...out.value.metadata,privateRecoveryRequestId:activity.requestId};
        if(activity?.state==='uncertain'&&!['complete','ended','failed'].includes(out.value.status)){
            const receipt=await privateRecordRequest(`/runs/${runId}/actions/${activity.requestId}`);
            if(receipt.state==='uncertain'&&receipt.envelope){
                const {tenantId,vault,secrets}=await privateProjectSecrets(runId);
                const bytes=await openPrivateObject(secrets.workerStateKey,{tenantId,vaultId:vault.vaultId,runId,objectId:activity.requestId,revision:1,purpose:'event'},receipt.envelope);
                try{const failure=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(validDrNibActiveWork(failure.activeWork))out.value.activeWork={...failure.activeWork,running:false};}finally{bytes.fill(0);}
            }
            out.value.status='paused';out.value.pauseReason='uncertain';
            out.value.metadata={...out.value.metadata,privateUncertainRequestId:activity.requestId,privateActionError:'Research is waiting for a saved-work recovery check. The deposit remains in escrow; unresolved operations cannot be repeated or charged twice.'};
        }
        if (activity?.state === 'processing' && activity.progress) {
            const { tenantId, vault, secrets } = await privateProjectSecrets(runId);
            const revision = activity.progress.context?.revision;
            if (!Number.isSafeInteger(revision) || revision < 1 || revision > 256) throw Error('Invalid private activity revision.');
            const bytes = await openPrivateObject(secrets.workerStateKey, { tenantId, vaultId: vault.vaultId, runId, objectId: activity.requestId, revision, purpose: 'action-progress' }, activity.progress);
            try {
                const snapshot = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
                if (bytes.length > 512 * 1024 || !Array.isArray(snapshot.events) || snapshot.events.length > 512) throw Error('Invalid private activity snapshot.');
                if(validDrNibActiveWork(snapshot.activeWork))out.value.activeWork={...snapshot.activeWork,...(activity.recoveryAvailable?{running:false}:{})};
                // Read-only overlay. Mutation callers always use the committed manifest.
                out.value.events = mergePrivateProgressRows(out.value.events??[],snapshot.events,!!out.value.privateCheckpoint);
                if(['planned','paused','awaiting'].includes(out.value.status)&&snapshot.events.some((e:any)=>e.type==='thinking'&&['sources','agent','write','verify','search'].includes(e.phase)))out.value.status='running';
                if (snapshot.decisions !== undefined) {
                    if (!Array.isArray(snapshot.decisions) || snapshot.decisions.length > 16) throw Error('Invalid private decision snapshot.');
                    out.value.decisions = mergePrivateProgressRows(out.value.decisions??[],snapshot.decisions,!!out.value.privateCheckpoint,true);
                }
            } finally { bytes.fill(0); }
        }
    }
    if(includeProgress){
      const history:any[]=[];
      for(const object of objects.filter(o=>o.kind==='checkpoint')){
        const key=`${runId}:${object.objectId}:${object.revision}`;
        let flight=questionHistoryFlights.get(key);
        if(!flight){
          for(const old of questionHistoryFlights.keys())if(old.startsWith(`${runId}:${object.objectId}:`))questionHistoryFlights.delete(old);
          while(questionHistoryFlights.size>=64)questionHistoryFlights.delete(questionHistoryFlights.keys().next().value!);
          flight=readPrivateObject(runId,object.objectId,'checkpoint').then(({value})=>privateJournalQuestions(value));
          questionHistoryFlights.set(key,flight);
          void flight.catch(()=>questionHistoryFlights.delete(key));
        }
        try{history.push(...await flight);}catch{out.value.metadata={...out.value.metadata,privateQuestionHistoryUnavailable:true};}
      }
      out.value.decisions=mergePrivateQuestionHistory(out.value.decisions??[],history,out.value.events??[]);
    }
    return { ...out, objectId: manifest.objectId };
}
export async function updatePrivateManifest(runId: string, change: (value: any) => any) { const before = await getPrivateManifest(runId), value = change(structuredClone(before.value)); await savePrivateObject(runId, before.objectId, 'manifest', value, before.revision); return value; }

/** Append an encrypted command while the active action owns the manifest.
 * The worker consumes it at its next new operation; this is an acknowledgment,
 * never a claim that an in-flight provider request has already stopped. */
export async function queuePrivateControl(runId:string,command:'pause'|'guidance',text?:string){
    if(command==='guidance'&&(!text?.trim()||text.length>8000))throw Error('Guidance must contain 1–8,000 characters.');
    const [{value},activity]=await Promise.all([getPrivateManifest(runId),privateRecordRequest(`/runs/${runId}/actions`)]);
    const targetRequestId=activity.state==='processing'?activity.requestId:command==='guidance'&&['paused','awaiting'].includes(value.status)?value.privateCheckpoint?.rootRequestId:null;
    if(!targetRequestId)return null;
    if(!/^[0-9a-f-]{36}$/i.test(targetRequestId)||!['planned','running','paused','awaiting'].includes(value.status))throw Error('This action cannot accept a research command. Refresh before continuing.');
    await savePrivateObject(runId,crypto.randomUUID(),'intent',{format:'drnib-control-v1',targetRequestId,command,...(command==='guidance'?{text:text!.trim()}:{})});
    return {id:runId,queued:true,command};
}

export async function requirePrivateInputs(runId:string,brief?:unknown){
    const [{value},listed]=await Promise.all([getPrivateManifest(runId),listPrivateSources(runId)]);
    requirePrivateResearchInputs(brief??value.brief,listed.sources);
}

/** Explicit owner action. No key/credential rotation happens on page load.
 * The saved pending CryptoKey survives crash/response loss before promotion. */
export async function replacePrivateRecoveryCredentials(): Promise<boolean> {
    if (!privateBuildEnabled()) throw Error('Private recovery is unavailable.');
    const tenantId = await privateTenantId();
    if (!navigator.locks) throw Error('This browser cannot safely coordinate recovery replacement. Use a current browser.');
    return await navigator.locks.request(`drnib-vault-replacement:${tenantId}`, async () => {
        const vault = await unlockPrivateVault(tenantId);
        const active = await privateRecordRequest('/vault');
        const local = await getEnrolledVault(tenantId, active.vaultId);
        if (!local || local.vaultId !== vault.vaultId) throw Error('Use an enrolled device to replace recovery.');
        let pending = local.pendingReplacement;
        if (!pending) {
            const snapshot = await privateRecordRequest('/vault/recovery-snapshot');
            if (snapshot.vaultId !== vault.vaultId || snapshot.revision !== local.revision ||
                !samePrivateVaultEnvelope(snapshot.recoveryEnvelope, local.recoveryEnvelope) || !Array.isArray(snapshot.projects) || snapshot.projects.length > 1000)
                throw Error('Private projects changed. Refresh before replacing recovery.');
            const password = await ask({ mode: 'set-password', tenantId });
            const created = await createPrivateVault(tenantId, vault.vaultId, password.secret);
            try {
                const projects = [];
                for (const project of snapshot.projects) projects.push({ runId: project.runId, expectedDigest: project.expectedDigest,
                    envelope: await rewrapPrivateProjectKeys(vault, created.vault, project.runId, project.envelope) });
                await ask({ mode: 'replace', tenantId, recoveryCode: codeFor(created.recoverySecret) });
                pending = { tenantId, vaultId: vault.vaultId, vault: created.vault, revision: local.revision + 1,
                    recoveryEnvelope: created.recoveryEnvelope, recoveryConfirmed: true, replacementProjects: projects };
                // Persist before dispatch. Never overwrite the old usable key.
                await updateEnrolledVault({ ...local, pendingReplacement: pending });
            } finally { created.recoverySecret.fill(0); }
        }
        try {
            await privateRecordRequest('/vault/replace-recovery', { method: 'POST', body: JSON.stringify({
                vaultId: pending.vaultId, expectedRevision: pending.revision - 1, recoveryEnvelope: pending.recoveryEnvelope, projects: pending.replacementProjects }) });
        } catch (error) {
            const remote = await privateRecordRequest('/vault');
            if (remote.revision !== pending.revision || !samePrivateVaultEnvelope(remote.recoveryEnvelope, pending.recoveryEnvelope)) {
                // A confirmed rejection permits a fresh snapshot next time;
                // unknown outcomes keep both keys, ready to reconcile on unlock.
                if ((error as {status?: number}).status === 409 && remote.revision === local.revision &&
                    samePrivateVaultEnvelope(remote.recoveryEnvelope, local.recoveryEnvelope)) {
                    const { pendingReplacement: _pending, ...previous } = local;
                    await updateEnrolledVault(previous);
                }
                throw error;
            }
        }
        const remote = await privateRecordRequest('/vault');
        if (remote.revision !== pending.revision || !samePrivateVaultEnvelope(remote.recoveryEnvelope, pending.recoveryEnvelope))
            throw Error('Recovery replacement needs another confirmation check. Both enrolled keys are preserved.');
        const { replacementProjects: _projects, ...promoted } = pending;
        await promoteEnrolledVault(promoted);
        return pending.recoveryEnvelope.version === 2;
    });
}

/** Owner-only, browser-decrypted recovery diagnostics. No key or full journal
 * leaves this client; only bounded operation summaries are rendered. */
export async function privateRecoveryDiagnostics(runId:string){
 const [{value:manifest},activity]=await Promise.all([getPrivateManifest(runId),privateRecordRequest(`/runs/${runId}/actions`)]);
 const root=privateRecoveryRoot(manifest,activity);
 if(!root)throw Error('No saved research checkpoint is available.');
 const {value:journal}=await readPrivateObject(runId,root,'checkpoint');
 if(journal.format!=='drnib-checkpoint-v1'||!Array.isArray(journal.entries))throw Error('Invalid saved research checkpoint.');
 return journal.entries.slice(0,128).map((entry:any,index:number)=>{
  const value=entry.result?.value;let detail='';
  if(entry.kind==='infer'){try{const proposal=JSON.parse(value?.choices?.[0]?.message?.content??'');detail=[proposal.tool,proposal.why].filter(v=>typeof v==='string').join(': ')||'Saved model response';}catch{detail='Saved model response';}}
  if(entry.kind==='judge')detail=JSON.stringify(value?.answers??{});
  if(entry.kind==='owner-answer'){const result=value?.toolResult;detail=result?JSON.stringify({contentUnavailable:result.contentUnavailable===true,sources:(result.sources??[]).map((source:any)=>({url:source.url,characters:typeof source.text==='string'?source.text.length:0,preview:typeof source.text==='string'?source.text.slice(0,240):''}))}):'Saved owner answer';}
  return `${index+1}. ${String(entry.kind).slice(0,40)} · ${String(entry.state).slice(0,20)}: ${detail.slice(0,2400)}`;
 });
}
