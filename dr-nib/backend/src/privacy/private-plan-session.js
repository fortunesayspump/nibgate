import {isConfidentialRun} from './guard.js';
import {openHpkeSource,recipientIdForPublicKey,validateHpkeSourceEnvelope} from './source-hpke.js';
import {withAttestedWorkerKey} from './private-worker-key.js';
import {createPrivateWorkerStore} from './private-worker-store.js';
import {createPrivateWorkerEventPort} from './private-worker-events.js';
import {createPrivatePlanRunner} from './private-plan-stage.js';
import {createPrivateWriteRunner} from './private-write-stage.js';
import {sealHpkeReport} from './source-hpke.js';
import * as HPKE from 'hpke';

const FILE=/\.(pdf|docx|xlsx|csv|txt|md|png|jpg|jpeg|webp)$/i;
const hpke=new HPKE.CipherSuite(HPKE.KEM_DHKEM_P256_HKDF_SHA256,HPKE.KDF_HKDF_SHA256,HPKE.AEAD_AES_128_GCM);
function fail(){const e=new Error('PRIVATE_PLAN_SESSION_UNAVAILABLE');e.code='PRIVATE_PLAN_SESSION_UNAVAILABLE';return e;}
function canonicalFile(value){
  if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw fail();
  const bytes=Buffer.from(value,'base64');
  if(bytes.length<1||bytes.length>2*1024*1024||bytes.toString('base64')!==value)throw fail();
  return bytes;
}

/** Callable measured-guest composition for the first real Dr. Nib plan stage.
 * The enclosing guest route must authenticate owner, verify fresh attestation
 * and recipient-key possession, and enforce one-use session/job semantics.
 * This function never returns the private plan to the ordinary API host. */
function createSessionJob({db,aiPort,model,write=false,parseDocument=async(name,bytes)=>(await import('../sources/parse.js')).parseSource(name,bytes)}={}){
  if(typeof db?.$transaction!=='function'||typeof aiPort?.infer!=='function'||
     aiPort.privateVerifiedTransport!=='phala-aci-v1'||
     typeof parseDocument!=='function'||typeof model!=='string'||!model)throw fail();
  return Object.freeze({
    async run({run,sessionId,sourceEnvelope,keyEnvelope,guestPrivateKey,guestPublicKey}){
      try{
        if(!isConfidentialRun(run)||run.deletedAt!=null||!['draft','planning','planned',...(write?['running']:[])].includes(run.status)||
           typeof run.userId!=='string'||!run.userId)throw fail();
        const sourceContext=validateHpkeSourceEnvelope(sourceEnvelope,{tenantId:run.userId,runId:run.id});
        if(sourceContext.recipientId!==recipientIdForPublicKey(guestPublicKey)||
           keyEnvelope?.context?.objectId===sourceContext.objectId)throw fail();
        const sourceBytes=await openHpkeSource({recipientPrivateKey:guestPrivateKey,expectedContext:sourceContext,envelope:sourceEnvelope});
        let input;
        try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(sourceBytes));}catch{throw fail();}
        finally{if(sourceBytes instanceof Uint8Array)sourceBytes.fill(0);}
        const names=input&&typeof input==='object'&&!Array.isArray(input)?Object.keys(input).sort().join(','):'';
        const textMode=names==='browserPublicKey,question,sourceText,title';
        const fileMode=names==='browserPublicKey,fileBase64,fileName,question,title';
        if(!textMode&&!fileMode||typeof input.question!=='string'||input.question.trim().length<3||input.question.length>1000||
           typeof input.title!=='string'||!input.title.trim()||input.title.length>160||
           typeof input.browserPublicKey!=='string')throw fail();
        // The result key is part of the encrypted request and will be used by
        // a later sealed-report release stage; never persist it in a clear row.
        const browserKey=Buffer.from(input.browserPublicKey,'base64');
        if(browserKey.toString('base64')!==input.browserPublicKey||browserKey.length!==65||browserKey[0]!==4)throw fail();
        await hpke.DeserializePublicKey(browserKey); // reject invalid curve points before a paid model call
        let sourceText;
        if(textMode){
          if(typeof input.sourceText!=='string'||!input.sourceText.trim()||input.sourceText.length>100000)throw fail();
          sourceText=input.sourceText;
        }else{
          if(typeof input.fileName!=='string'||input.fileName.length<1||input.fileName.length>160||!FILE.test(input.fileName))throw fail();
          const parsed=await parseDocument(input.fileName,canonicalFile(input.fileBase64));
          if(typeof parsed?.text!=='string'||!parsed.text.trim()||parsed.text.length>100000||parsed.truncated===true)throw fail();
          sourceText=parsed.text;
        }
        // This bounded source-only release asks for a 300-word report. The
        // full 1,200+ word sectioned writer is a separate migration and must
        // never be silently attempted under the 1,200-token private AI cap.
        const state={brief:{topic:input.question,liveWeb:false,lengthWords:300},plan:null,pendingGuidance:null,
          resultRecipientPublicKey:input.browserPublicKey};
        const source={provider:'user-upload',url:`user-upload://${sourceContext.objectId}`,title:input.title,text:sourceText};
        return await withAttestedWorkerKey({run,sessionId,guestPrivateKey,guestPublicKey,keyEnvelope},async({keyProvider})=>{
          const store=createPrivateWorkerStore({db,keyProvider,tenantId:run.userId});
          const events=createPrivateWorkerEventPort({db,keyProvider,tenantId:run.userId});
          await store.initializeRunStateAndPlanning(run,{state,sources:[{sourceId:sourceContext.objectId,source}]});
          const plan=createPrivatePlanRunner({store,events,aiPort,model});
          await plan.run(run.id);
          if(!write)return {state:'planned',runId:run.id};
          await store.startSourceOnlyWrite(await store.loadRun(run.id));
          const writer=createPrivateWriteRunner({store,events,aiPort,model});
          const report=await writer.run(run.id);
          const fresh=await store.loadRun(run.id);
          if(fresh.status!=='running'||typeof report?.markdown!=='string')throw fail();
          const id=fresh.id; // deterministic v1 receipt for lost-response recovery
          const context={tenantId:fresh.userId,runId:fresh.id,objectId:id,revision:1,purpose:'report',
            recipientId:recipientIdForPublicKey(browserKey)};
          const envelope=await sealHpkeReport({recipientPublicKey:browserKey,context,
            plaintext:Buffer.from(JSON.stringify({markdown:report.markdown}))});
          const receipt=await store.completeSourceOnlyRun(fresh,{reportId:id,envelope});
          if(receipt.id!==id||receipt.version!==1||receipt.encrypted!==true)throw fail();
          return {id,version:1,encrypted:true};
        });
      }catch{throw fail();}
    },
  });
}

export function createPrivatePlanSessionJob(options){return createSessionJob(options)}

/** Source-only short plan+write slice of existing Dr. Nib stages. The opt-in
 * full-execute guest route journals both encrypted input envelopes before AI
 * and enforces one-use execution. It remains disabled by default. */
export function createPrivateSourceOnlySessionJob(options){return createSessionJob({...options,write:true})}
