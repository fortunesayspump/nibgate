import {createPhalaLifecycleApi,createOfficialPhalaLifecycleClient} from './phala-lifecycle-api.js';
import {createDurablePhalaWake} from './phala-durable-wake.js';
import {createPrivateLifecycleStore} from './private-lifecycle-store.js';
import {createBrokerAttestationPreflight} from './phala-broker-attestation.js';
import {createPinnedDstackVerifier} from './phala-verifier.js';

const HEX64=/^[0-9a-f]{64}$/;
const HEX40=/^[0-9a-f]{40}$/;
const HEX=/^(?:[0-9a-f]{2})+$/;
const CVM=/^[A-Za-z0-9:_-]{1,128}$/;
const RELEASE_KEYS='expectedAppId,expectedComposeHash,expectedInstanceId,expectedKeyProvider,expectedOsHash,reviewedReleaseControls';
const CONTROLS='debugDisabled,imagesDigestPinned,plaintextLogsDisabled,productionOsImage,sshDisabled';
function unavailable(){return new Error('PHALA_WAKE_BOOTSTRAP_UNAVAILABLE')}
function keys(value,expected){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===expected}
function positiveInt(value,min,max){
  if(typeof value!=='string'||!/^[1-9][0-9]*$/.test(value))throw unavailable();
  const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw unavailable();return n;
}
function releasePolicy(text){
  let value;try{value=JSON.parse(text)}catch{throw unavailable()}
  if(!keys(value,RELEASE_KEYS)||!HEX40.test(value.expectedAppId)||
     !HEX40.test(value.expectedInstanceId)||
     !HEX64.test(value.expectedComposeHash)||!HEX64.test(value.expectedOsHash)||
     !keys(value.expectedKeyProvider,'id,name')||value.expectedKeyProvider.name!=='kms'||
     !HEX.test(value.expectedKeyProvider.id)||
     !keys(value.reviewedReleaseControls,CONTROLS)||
     Object.values(value.reviewedReleaseControls).some(v=>v!==true))throw unavailable();
  return Object.freeze(value);
}
function guestURL(value){
  let url;try{url=new URL(value)}catch{throw unavailable()}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw unavailable();
  return url;
}

/** Deliberately OFF unless every release-policy, API and budget input exists.
 * Dependency injection is for synthetic tests; the production default loads
 * the exact official SDK declared in package.json. No configuration enables
 * guest key release without a fresh full verifier + live HPKE proof. */
export async function createConfiguredPhalaWake({env=process.env,guestBaseURL,tenantId,signCapability,accessMode='owner',
  fetchImpl=fetch,clientFactory,lifecycleStore,getRunTenant,verifierFactory=createPinnedDstackVerifier}={}){
  if(env.DRNIB_PRIVATE_WAKE_ENABLED!=='true')return null;
  if(!['owner','authenticated'].includes(accessMode)||typeof signCapability!=='function'||typeof tenantId!=='string'||!CVM.test(tenantId)||
     typeof env.PHALA_CLOUD_API_KEY!=='string'||! /^phak_[A-Za-z0-9_-]{8,256}$/.test(env.PHALA_CLOUD_API_KEY)||
     typeof env.DRNIB_PRIVATE_CVM_ID!=='string'||!CVM.test(env.DRNIB_PRIVATE_CVM_ID)||
     typeof env.DRNIB_PRIVATE_RELEASE_POLICY_JSON!=='string'||
     typeof env.DRNIB_PRIVATE_VERIFIER_URL!=='string'||
     typeof env.DRNIB_PRIVATE_VERIFIER_SPKI_SHA256!=='string'||
     (typeof env.DEBUG==='string'&&env.DEBUG.trim()!==''))throw unavailable();
  const guest=guestURL(guestBaseURL);
  const idleMs=positiveInt(env.DRNIB_PRIVATE_WAKE_IDLE_MS,15_000,300_000);
  const maxRuntimeMs=positiveInt(env.DRNIB_PRIVATE_WAKE_MAX_RUNTIME_MS,30_000,7_200_000);
  const maxActive=positiveInt(env.DRNIB_PRIVATE_WAKE_MAX_ACTIVE??'4',1,8);
  const maxPending=positiveInt(env.DRNIB_PRIVATE_WAKE_MAX_PENDING??'64',1,256);
  const policy=releasePolicy(env.DRNIB_PRIVATE_RELEASE_POLICY_JSON);
  // Validate verifier URL and SPKI pin before constructing a cloud client.
  if(typeof verifierFactory!=='function')throw unavailable();
  const verifier=verifierFactory({url:env.DRNIB_PRIVATE_VERIFIER_URL,
    spkiSha256:env.DRNIB_PRIVATE_VERIFIER_SPKI_SHA256});
  if(typeof verifier?.verifyEvidence!=='function')throw unavailable();
  const factory=clientFactory??createOfficialPhalaLifecycleClient;
  if(typeof factory!=='function')throw unavailable();
  let client;
  try{client=await factory({apiKey:env.PHALA_CLOUD_API_KEY,
    baseURL:'https://cloud-api.phala.com/api/v1',version:'2026-06-23',timeout:60_000})}
  catch{throw unavailable()}
  const api=createPhalaLifecycleApi({client,cvmId:env.DRNIB_PRIVATE_CVM_ID});
  const guestReady=async()=>{
    try{
      const response=await fetchImpl(new URL('/health',guest),{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(response.status!==200)return false;
      const data=await response.json();
      return data?.ok===true&&data?.privateReady===true;
    }catch{return false}
  };
  const verifyAttestation=createBrokerAttestationPreflight({guestBaseURL:guest.toString(),tenantId,
    signCapability,verifyEvidence:verifier.verifyEvidence,policy,fetchImpl,
    getRunTenant:accessMode==='authenticated'?(getRunTenant??(async runId=>{
      const {db}=await import('../db.js');
      const run=await db.researchRun.findUnique({where:{id:runId},select:{userId:true,deletedAt:true,metadata:true}});
      return run&&!run.deletedAt&&run.metadata?.privacyMode==='confidential'?run.userId:null;
    })):undefined});
  const store=lifecycleStore??createPrivateLifecycleStore({db:(await import('../db.js')).db,cvmId:env.DRNIB_PRIVATE_CVM_ID,tenantId,accessMode});
  const controller=createDurablePhalaWake({store,api,guestReady,verifyAttestation,idleMs,maxRuntimeMs,maxActive,maxPending});
  await controller.status(); // Require migration/grants before advertising availability.
  return controller.start();
}
