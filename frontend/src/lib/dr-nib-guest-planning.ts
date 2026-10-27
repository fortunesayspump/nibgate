'use client';
import { createPrivateVault, createPrivateProjectKeys, openPrivateProjectKeys, type PrivateVaultEnvelope, type PrivateRecoveryEnvelope } from './dr-nib-private-vault';
import { reencryptGuestManifest } from './dr-nib-guest-adoption';
import { sealPrivateObject, type PrivateObjectEnvelope } from './dr-nib-private-objects';
import { readEncryptedGuestDraft, updateEncryptedGuestDraft, readGuestVaultKey, saveGuestVaultKey, withGuestLock } from './dr-nib-guest-store';
const BASE='/drnib-private-api/v1/guest-planning';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type GuestPlanningLimits={maxActions?:number;maxReplans?:number;maxCostMicroUsd?:number;ttlMs?:number;planTtlMs?:number};
export type GuestPlanningCapabilities={enabled:boolean;textOnly?:boolean;limits?:GuestPlanningLimits};
type Session={token:string;sessionId:string;tenantId:string;runId:string;vaultId:string;expiresAt:string;limits?:GuestPlanningLimits};
type Bootstrap={vaultRecoveryEnvelope:PrivateRecoveryEnvelope;projectKeysEnvelope:PrivateVaultEnvelope;manifestId:string;manifestEnvelope:PrivateObjectEnvelope};
type Adoption={adoptionId:string;tenantId?:string;targetRunId?:string;body?:Record<string,unknown>};
type StoredDraft={version:1;runId:string|null;adoptedRunId?:string;snapshot:Record<string,unknown>;session?:Session;bootstrap?:Bootstrap;pending?:Record<string,string>;adoption?:Adoption};
export type GuestRun = { id: string; status: string; guestAdoptionValidation?: {ready:boolean;reason:string}; [key:string]: unknown };
export type GuestDraft={revision:number;runId:string|null;adoptedRunId?:string;snapshot:Record<string,unknown>;expiresAt?:string;planningExpired:boolean;limits?:GuestPlanningLimits};
let active:StoredDraft|null=null,revision=0,loaded=false;
const visible=(value:StoredDraft):GuestDraft=>({revision,runId:value.adoptedRunId??value.runId,adoptedRunId:value.adoptedRunId,snapshot:value.snapshot,expiresAt:value.session?.expiresAt,planningExpired:!value.adoptedRunId&&Boolean(value.session&&Date.parse(value.session.expiresAt)<=Date.now()),limits:publicLimits(value.session?.limits)});
function publicLimits(value:unknown):GuestPlanningLimits|undefined {
  if(!value||typeof value!=='object')return;
  const result:GuestPlanningLimits={};
  for(const key of ['maxActions','maxReplans','maxCostMicroUsd','ttlMs','planTtlMs'] as const){const n=(value as Record<string,unknown>)[key];if(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)result[key]=n;}
  return Object.keys(result).length?result:undefined;
}
/** Presentation guidance only; never retries, resets, signs in or creates a run.
 * Expiry ends compute, not local restoration or server adoption eligibility. */
export function classifyGuestPlanningError(error:unknown):{kind:'expired'|'storage'|'adopted'|'sign-in'|'unavailable'|'retry';message:string;retryRestore:boolean} {
  const code=error&&typeof error==='object'?String((error as {code?:unknown}).code??''):'';
  if(['GUEST_SESSION_EXPIRED','PRIVATE_GUEST_SESSION_CLOSED'].includes(code))return {kind:'expired',message:'Guest planning has ended. Your local draft is still saved. Sign in to try saving it to your account; the server copy may no longer be available.',retryRestore:false};
  if(code==='GUEST_DRAFT_RESTORE_FAILED')return {kind:'storage',message:'The encrypted draft could not be opened in this browser. It has not been replaced. Reopen the original browser profile or restore browser storage access.',retryRestore:false};
  if(code==='GUEST_SESSION_ADOPTED')return {kind:'adopted',message:'This draft has already been saved to an account. Sign in and open the saved project.',retryRestore:false};
  if(['GUEST_ACCOUNT_REQUIRED','GUEST_SESSION_REQUIRED','unauthenticated'].includes(code)||Boolean(error&&typeof error==='object'&&(error as {status?:unknown}).status===401))return {kind:'sign-in',message:'Sign in to continue saving this draft. No new planning request was started.',retryRestore:false};
  if(code==='GUEST_PLANNING_UNAVAILABLE')return {kind:'unavailable',message:'Guest planning is temporarily unavailable. Keep your saved draft and try again later.',retryRestore:false};
  return {kind:'retry',message:'The saved project could not be loaded. Your local draft has not been replaced. You can explicitly retry loading it.',retryRestore:true};
}
async function load(){if(!loaded){const row=await readEncryptedGuestDraft<StoredDraft>();active=row?.value??null;revision=row?.revision??0;loaded=true;}return active;}
let writes:Promise<unknown>=Promise.resolve();
async function update(work:(value:StoredDraft)=>StoredDraft,expected?:number|(()=>number)){
  const next=writes.then(async()=>{
    const result=await updateEncryptedGuestDraft<StoredDraft>(v=>work(v??{version:1,runId:null,snapshot:{}}),typeof expected==='function'?expected():expected);
    active=result.value;revision=result.revision;loaded=true;return active;
  });
  writes=next.then(()=>undefined,()=>undefined);return next;
}
export async function restoreGuestDraft():Promise<GuestDraft|null>{
  loaded=false;
  try{const value=await load();return value?visible(value):null;}
  catch(cause){throw Object.assign(new Error('The encrypted guest draft could not be restored. It has not been replaced.',{cause}),{code:'GUEST_DRAFT_RESTORE_FAILED'});}
}
export async function persistGuestDraft(patch:{snapshot:Record<string,unknown>},expectedRevision?:number):Promise<GuestDraft>{
  await load();const value=await update(v=>({...v,snapshot:structuredClone(patch.snapshot)}),expectedRevision??(()=>revision));return visible(value);
}
export async function saveGuestComposerSnapshot(snapshot:Record<string,unknown>){await persistGuestDraft({snapshot});}
export const restoreGuestComposerSnapshot=restoreGuestDraft;
export function isGuestProject(runId:string){return Boolean(active?.runId===runId&&active.session&&active.adoptedRunId!==runId);}
export async function isGuestRun(runId:string){try{await load();}catch{if(active?.runId===runId)throw Error('The guest draft could not be restored. No request was sent.');return false;}return isGuestProject(runId);}
async function responseJson(response:Response){
  const text=await response.text();if(text.length>6*1024*1024)throw Error('Guest response exceeded its limit.');
  let value:Record<string,unknown>;try{value=JSON.parse(text);}catch{throw Error('Guest planning returned an invalid response.');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Guest planning returned an invalid response.');
  if(!response.ok)throw Object.assign(Error(response.status===410||value.code==='GUEST_SESSION_EXPIRED'?'This guest planning session expired. Your draft remains on this device.':response.status===429?'Guest planning limit reached. Sign in or try again later.':response.status===401?'Sign in to save this plan to your account.':'Guest planning could not continue. Your saved draft has not been replaced.'),{status:response.status,code:value.code});return value;
}
/** Preserve only machine codes, never display server-provided error text. */
export async function guestPlanningResponseError(response:Response):Promise<Error> {
  try { await responseJson(response); } catch(error) { return error instanceof Error?error:new Error('Guest planning could not continue.'); }
  return new Error('Unexpected successful guest response.');
}
async function guestRequest(path:string,options:RequestInit={},session?:Session){
  const current=session??(await load())?.session;
  return responseJson(await fetch(BASE+path,{...options,credentials:'include',cache:'no-store',redirect:'error',signal:options.signal??AbortSignal.timeout(30000),headers:{'content-type':'application/json',...(current?{authorization:`Bearer ${current.token}`}:{ }),...options.headers}}));
}
export async function guestPlanningCapabilities():Promise<GuestPlanningCapabilities>{
  try{const response=await fetch(BASE+'/capabilities',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)return {enabled:false};const value=await response.json();return {enabled:value.enabled===true,textOnly:value.textOnly===true,limits:publicLimits(value.limits)};}catch{return {enabled:false};}
}
export async function guestPlanningAvailable(){return (await guestPlanningCapabilities()).enabled;}
/** Route only an exact locally-owned guest run; account identity/vault requests
 * are never switched globally when an account signs in. */
export async function guestTransport(path:string,options:RequestInit):Promise<{base:string;headers:Record<string,string>}|null>{
  let runId=path.match(/^\/runs\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
  if(!runId&&path.startsWith('/sessions')&&typeof options.body==='string'){try{runId=JSON.parse(options.body).runId;}catch{}}
  // Account identity, enrollment and unrelated routes never touch guest storage.
  if(!runId)return null;
  if(!await isGuestRun(runId))return null;
  const value=active;if(!value?.session||runId!==value.runId)return null;
  return {base:BASE,headers:{authorization:`Bearer ${value.session.token}`}};
}
export async function guestProjectSecrets(runId:string){
  if(!await isGuestRun(runId))return null;
  const value=active;if(!value?.session||value.runId!==runId)return null;
  if(!value.bootstrap)throw Error('Guest project setup is incomplete. Your local draft is still saved.');
  const key=await readGuestVaultKey(runId);if(!key||key.extractable)throw Error('Guest encryption key is unavailable in this browser. The draft has not been replaced.');
  const vault={tenantId:value.session.tenantId,vaultId:value.session.vaultId,key};
  return {tenantId:vault.tenantId,vault,secrets:await openPrivateProjectKeys(vault,runId,value.bootstrap.projectKeysEnvelope)};
}
export async function readGuestPending(runId:string):Promise<string|null>{const value=await load();return value?.pending?.[runId]??null;}
export async function writeGuestPending(runId:string,pending:string|null){await update(v=>{const next={...v.pending};if(pending===null)delete next[runId];else next[runId]=pending;return {...v,pending:next};});}
export async function lockGuestAction<T>(runId:string,work:()=>Promise<T>):Promise<T>{
  if(!navigator.locks)throw Error('Guest planning requires browser locks to avoid duplicate requests.');
  return navigator.locks.request(`drnib-guest:action:${runId}`,{ifAvailable:true},async lock=>{if(!lock)throw Error('This guest project is active in another tab. No duplicate request was sent.');await restoreGuestDraft();if(active?.adoptedRunId)throw Error('This guest plan was saved to an account in another tab. Open the saved project.');return work();});
}

export async function beginGuestPlanning(topic:string):Promise<GuestRun>{
  if(typeof topic!=='string'||topic.trim().length<3||topic.length>1000)throw Error('Enter a research question of 3–1,000 characters.');
  return withGuestLock('begin',async()=>{
    await restoreGuestDraft();
    if(active?.runId){
      if(active.adoptedRunId)throw Error('This guest project is saved to your account. Open the saved project.');
      const {getPrivateManifest}=await import('./dr-nib-private-records');
      let saved;
      try { saved=await getPrivateManifest(active.runId); }
      catch(error) {
        if((error as {status?:number})?.status!==404||!active.bootstrap)throw error;
        await guestRequest('/bootstrap',{method:'POST',body:JSON.stringify(active.bootstrap)},active.session);
        saved=await getPrivateManifest(active.runId);
      }
      if(saved.value.brief?.topic!==topic.trim())throw Error('A guest project is already saved on this device. Resume it or sign in before starting another.');
      if(saved.value.status!=='intake'||saved.value.questions?.length||saved.value.decisions?.some((d:Record<string,unknown>)=>d.kind==='question'))return {...saved.value,metadata:{...saved.value.metadata,guestPlanning:true}};
      const {privateAction}=await import('./dr-nib-private-actions');return {...await privateAction(active.runId,'intake'),metadata:{...saved.value.metadata,guestPlanning:true}};
    }
    const {configuredPrivateVerification}=await import('./dr-nib-private-verification');
    if(!configuredPrivateVerification())throw Error('The reviewed private worker is not configured. No guest inference was started.');
    // Establish durable storage before requesting any anonymous capacity.
    await update(v=>({...v,snapshot:{...v.snapshot,topic}}));
    const raw=await guestRequest('/session',{method:'POST',body:'{}'});
    const session=raw as unknown as Session;
    if(!UUID.test(session.sessionId)||!UUID.test(session.runId)||!UUID.test(session.vaultId)||session.tenantId!==`guest:${session.sessionId}`||typeof session.token!=='string'||!/^[a-f0-9]{64}$/.test(session.token)||!Number.isFinite(Date.parse(session.expiresAt)))throw Error('Guest session identity was invalid.');
    const created=await createPrivateVault(session.tenantId,session.vaultId);created.recoverySecret.fill(0);
    await saveGuestVaultKey(session.runId,created.vault.key);
    const keys=await createPrivateProjectKeys(created.vault,session.runId),manifestId=crypto.randomUUID(),now=new Date().toISOString();
    const manifest={id:session.runId,title:topic.trim().slice(0,160),description:'',brief:{topic:topic.trim(),liveWeb:false},status:'intake',questions:[],intake:[],plan:null,createdAt:now,updatedAt:now,version:1};
    let manifestEnvelope:PrivateObjectEnvelope;
    try{manifestEnvelope=await sealPrivateObject(keys.secrets.workerStateKey,{tenantId:session.tenantId,vaultId:session.vaultId,runId:session.runId,objectId:manifestId,purpose:'manifest',revision:1},new TextEncoder().encode(JSON.stringify(manifest)));}finally{keys.secrets.workerStateKey.fill(0);keys.secrets.reportKeySeed.fill(0);}
    const bootstrap={vaultRecoveryEnvelope:created.recoveryEnvelope,projectKeysEnvelope:keys.envelope,manifestId,manifestEnvelope};
    await update(v=>({...v,runId:session.runId,session,bootstrap}));
    const {privateAction}=await import('./dr-nib-private-actions');
    try{await guestRequest('/bootstrap',{method:'POST',body:JSON.stringify(bootstrap)},session);return {...await privateAction(session.runId,'intake'),metadata:{guestPlanning:true}};}
    catch(error){if(error instanceof Error)Object.defineProperty(error,'privateRunId',{value:session.runId});throw error;}
  });
}
export const createGuestProject=beginGuestPlanning;

/** Account auth and guest possession are both checked server-side. Every object
 * is decrypted then freshly sealed under account tenant/vault/run AAD. */
export async function adoptGuestProject(runId:string):Promise<GuestRun>{
  return withGuestLock(`action:${runId}`,async()=>{
    await restoreGuestDraft();const draft=active;
    if(!draft?.session||draft.runId!==runId)throw Error('This guest draft is not available in this browser.');
    const records=await import('./dr-nib-private-records');
    const accountTenant=await records.privateTenantId();
    let adoption=draft.adoption;
    if(adoption?.tenantId&&adoption.tenantId!==accountTenant)throw Error('This draft adoption belongs to a different signed-in account.');
    if(!adoption){adoption={adoptionId:crypto.randomUUID(),tenantId:accountTenant};await update(v=>({...v,adoption}));}
    const prepared=await guestRequest('/adoption/prepare',{method:'POST',body:JSON.stringify({adoptionId:adoption.adoptionId})},draft.session);
    const targetRunId=String(prepared.id??prepared.targetRunId??adoption.targetRunId??'');
    if(!UUID.test(targetRunId))throw Error('Account adoption identity was invalid.');
    if(prepared.state!=='committed'){
      let vault;
      try { vault=await records.unlockPrivateVault(accountTenant); }
      catch(error) {
        try { await guestRequest('/adoption/cancel',{method:'POST',body:JSON.stringify({adoptionId:adoption.adoptionId})},draft.session);await update(v=>({...v,adoption:undefined})); } catch { /* Retain the frozen adoption ID until server outcome is known. */ }
        throw error;
      }
      const remote=await records.privateRecordRequest('/vault');
      if(remote.vaultId!==vault.vaultId)throw Error('Account vault changed. Retry adoption.');
      if(adoption.body&&(adoption.body.vaultId!==remote.vaultId||adoption.body.expectedVaultRevision!==remote.revision)){adoption={...adoption,body:undefined};await update(v=>({...v,adoption}));}
      if(!adoption.body){
        const stored=await records.privateRecordRequest(`/runs/${runId}/objects/${prepared.manifestId}`);
        if(stored.revision!==prepared.manifestRevision||stored.vaultId!==draft.session.vaultId)throw Error('Guest plan changed. Reload before adoption.');
        const access=await guestProjectSecrets(runId);if(!access)throw Error('Guest keys unavailable.');
        let encrypted;
        try { encrypted=await reencryptGuestManifest({sourceKey:access.secrets.workerStateKey,sourceContext:{tenantId:draft.session.tenantId,vaultId:draft.session.vaultId,runId,objectId:String(prepared.manifestId),purpose:'manifest',revision:Number(prepared.manifestRevision)},sourceEnvelope:stored.envelope,sourceDigest:String(prepared.manifestDigest),targetVault:vault,targetRunId}); }
        finally { access.secrets.workerStateKey.fill(0);access.secrets.reportKeySeed.fill(0); }
        adoption={...adoption,tenantId:accountTenant,targetRunId,body:{adoptionId:adoption.adoptionId,id:targetRunId,vaultId:vault.vaultId,expectedVaultRevision:remote.revision,...encrypted}};
        await update(v=>({...v,adoption}));
      }
      await guestRequest('/adoption/commit',{method:'POST',body:JSON.stringify(adoption.body)},draft.session);
    }
    // Do not delete guest keys or draft on a lost response. Confirm readable
    // account state, then run the worker's non-inference plan validation.
    let target=(await records.getPrivateManifest(targetRunId)).value;
    let validation={ready:target.status!=='planned',reason:''};
    if(target.status==='planned'){
      try {
        const {privateAction}=await import('./dr-nib-private-actions');await privateAction(targetRunId,'validate-plan');
        target=(await records.getPrivateManifest(targetRunId)).value;validation={ready:true,reason:''};
      } catch(error) { validation={ready:false,reason:error instanceof Error?error.message:'Plan verification could not be confirmed. Review or replan before funding.'}; }
    }
    await update(v=>({...v,adoptedRunId:targetRunId,snapshot:{...v.snapshot,projectId:targetRunId,project:target,phase:target.status==='planned'?'review':target.status==='intake-done'?'configure':'questions',pendingAdoption:null}}));
    return {...target,guestAdoptionValidation:validation};
  });
}
