import * as HPKE from 'hpke';
import {createPrivateWorkerStore} from './private-worker-store.js';
import {createPrivateWorkerEventPort} from './private-worker-events.js';
import {createPrivatePlanRunner} from './private-plan-stage.js';
import {createPrivateWriteRunner} from './private-write-stage.js';
import {createPrivateVerifyExtractionRunner} from './private-verify-extraction.js';
import {createPrivateVerifySupportStore} from './private-verify-support-store.js';
import {createPrivateVerifySupportRunner} from './private-verify-support.js';
import {createPrivateSupportFlowContract} from './private-support-flow-contract.js';
import {createPrivateVerifiedCompletionStore} from './private-verified-completion.js';
import {recipientIdForPublicKey,sealHpkeReport} from './source-hpke.js';

// Future-only measured-guest composition. It is deliberately not imported by
// the current guest route. The caller must authenticate the owner, verify the
// guest measurement and key possession, and pass only decoded sealed input.
// No ordinary provider, JEV, plaintext report or eventlog is reachable here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hpke=new HPKE.CipherSuite(HPKE.KEM_DHKEM_P256_HKDF_SHA256,HPKE.KDF_HKDF_SHA256,HPKE.AEAD_AES_128_GCM);
function denied(){const error=new Error('PRIVATE_SUPPORT_SESSION_UNAVAILABLE');error.code=error.message;return error;}
function canonical(value){return JSON.parse(JSON.stringify(value));}
async function preflight({runId,tenantId,state,sourceId,source}){
  if(!UUID.test(runId)||typeof tenantId!=='string'||!tenantId||tenantId.length>128||
     !UUID.test(sourceId)||!state||typeof state!=='object'||Array.isArray(state)||
     Object.keys(state).sort().join(',')!=='brief,pendingGuidance,plan,resultRecipientPublicKey'||
     state.plan!==null||state.pendingGuidance!==null||
     !state.brief||typeof state.brief!=='object'||Array.isArray(state.brief)||
     typeof state.brief.topic!=='string'||state.brief.topic.trim().length<3||
     state.brief.topic.length>1000||state.brief.liveWeb!==false||
     typeof state.resultRecipientPublicKey!=='string'||
     !source||typeof source!=='object'||Array.isArray(source)||
     source.provider!=='user-upload'||source.url!==`user-upload://${sourceId}`||
     typeof source.title!=='string'||!source.title.trim()||source.title.length>160||
     typeof source.text!=='string'||!source.text.trim()||source.text.length>100000)throw denied();
  const recipient=Buffer.from(state.resultRecipientPublicKey,'base64');
  if(recipient.length!==65||recipient[0]!==4||
     recipient.toString('base64')!==state.resultRecipientPublicKey)throw denied();
  await hpke.DeserializePublicKey(recipient); // Reject off-curve keys before reserving or calling AI.
  return recipient;
}

/** Compose the actual short plan, write, complete extraction and sampled
 * protected support stages under one future 30-call worst-case reservation.
 * Current private budget policy rejects this reservation before any provider
 * call, so enabling requires separately audited budget and provider hard caps.
 * This factory is intentionally callable only, with no HTTP or deploy wiring. */
export function createPrivateSupportSession({db,keyProvider,aiPort,budget,model}={}){
  if(typeof db?.$transaction!=='function'||typeof keyProvider!=='function'||
     typeof aiPort?.infer!=='function'||aiPort.privateVerifiedTransport!=='phala-aci-v1'||
     typeof budget?.run!=='function'||typeof model!=='string'||!model)throw denied();
  return Object.freeze({
    async run(input){
      try{
        const {runId,tenantId,sourceId}=input||{};
        const state=canonical(input?.state),source=canonical(input?.source);
        await preflight({runId,tenantId,state,sourceId,source});
        const store=createPrivateWorkerStore({db,keyProvider,tenantId});
        const events=createPrivateWorkerEventPort({db,keyProvider,tenantId});
        const supportStore=createPrivateVerifySupportStore({db,keyProvider,tenantId});
        const completion=createPrivateVerifiedCompletionStore({db,keyProvider,tenantId});
        const flow=createPrivateSupportFlowContract({
          loadRun:id=>db.researchRun.findUnique({where:{id}}),budget,aiPort,model,
          stages:{
            plan:async({aiPort:port})=>{
              await store.initializeRunStateAndPlanning(await store.loadRun(runId),
                {state,sources:[{sourceId,source}]});
              return createPrivatePlanRunner({store,events,aiPort:port,model}).run(runId);
            },
            write:async({aiPort:port})=>{
              await store.startSourceOnlyWrite(await store.loadRun(runId));
              return createPrivateWriteRunner({store,events,aiPort:port,model}).run(runId);
            },
            extract:async({aiPort:port})=>
              createPrivateVerifyExtractionRunner({store,events,aiPort:port,model}).run(runId),
            judge:async({aiPort:port,budget:permit})=>
              createPrivateVerifySupportRunner({supportStore,aiPort:port,budget:permit,model}).run(runId),
          },
          complete:async()=>{
            // The separate completion transaction rechecks the sealed report,
            // source, claims, manifest, recipient, owner and freshness under a
            // run lock after this in-guest HPKE seal. Never return markdown.
            const run=await store.loadRun(runId);
            const loaded=await store.getRunState(run);
            const report=await store.getReport(run,run.versions);
            if(run.status!=='running'||run.versions!==1||loaded?.revision!==3||
               typeof report?.markdown!=='string'||!report.markdown.trim()||
               loaded.state?.resultRecipientPublicKey!==state.resultRecipientPublicKey)throw denied();
            const recipient=Buffer.from(state.resultRecipientPublicKey,'base64');
            const envelope=await sealHpkeReport({recipientPublicKey:recipient,
              context:{tenantId,runId,objectId:runId,revision:1,purpose:'report',
                recipientId:recipientIdForPublicKey(recipient)},
              plaintext:Buffer.from(JSON.stringify({markdown:report.markdown,
                verification:{scope:'protected-ai-sampled',verified:false,reason:'not-jev-certified'}}))});
            const receipt=await completion.complete(run,{reportId:runId,envelope});
            return {id:receipt.id,version:receipt.version,encrypted:receipt.encrypted};
          },
        });
        return await flow.run({runId,tenantId});
      }catch{throw denied();}
    },
  });
}
