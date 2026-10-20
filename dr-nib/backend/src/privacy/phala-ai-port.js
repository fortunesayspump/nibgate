import {createHash} from 'node:crypto';
import {PRIVATE_ACI_REFUSAL,PRIVATE_ACI_FAILURE} from './private-aci-refusal.js';
const ROUTING=Object.freeze({aci_verified:true,zdr:true,data_collection:'deny',allow_fallbacks:false,require_parameters:true});

// Non-enumerable marker carrying the receipt-bound usage of a single verified
// call. It never appears in JSON/serialisation, so it cannot leak into prompts
// or a persisted report, but the metered wrapper can read it to charge actuals.
export const PRIVATE_USAGE=Symbol('nibgate.privateUsage');
export const PRIVATE_CALL_CHARGE=Symbol('nibgate.privateCallCharge');
export const PRIVATE_METERED_COST=Symbol('nibgate.privateMeteredCost');
export const PRIVATE_NOT_DISPATCHED=Symbol('nibgate.privateNotDispatched');
export const PRIVATE_REFUSAL_EVIDENCE=Symbol('nibgate.privateRefusalEvidence');
export const PRIVATE_FAILURE_EVIDENCE=Symbol('nibgate.privateFailureEvidence');
export const PRIVATE_RETRYABLE_REJECTION=Symbol('nibgate.privateRetryableRejection');
/**
 * Interface contract only. Production must supply @phala/aci-verifier's pinned
 * transport and receipt checks inside the measured worker. The serving session
 * is resolved per request through `channel.sessionFor(model)` (live discovery,
 * because gateway sessions rotate), never boot-pinned.
 */
export function createPhalaAiPort({approvedModels,connectVerified,maxPromptChars=150000,maxOutputTokens=1200,disableReasoning=false}) {
  if (!Array.isArray(approvedModels) || approvedModels.length===0 ||
      approvedModels.some(m=>typeof m!=='string' || !/^[a-zA-Z0-9/_:.-]{3,120}$/.test(m)) ||
      typeof connectVerified!=='function'||!Number.isSafeInteger(maxPromptChars)||maxPromptChars<1000||maxPromptChars>150000||
      !Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>16384||typeof disableReasoning!=='boolean')
    throw new Error('incomplete attested AI port');
  const models=new Set(approvedModels);
  return Object.freeze({
    // Accidental-miswire guard for measured-worker stages. This marker alone
    // is not attestation; infer() still verifies the channel and receipt.
    privateVerifiedTransport:'phala-aci-v1',
    async infer({model,messages,json=false,reasoningEffort,temperature,maxTokens=maxOutputTokens}) {
      const refusalProofs=[];
      for(let attempt=0;attempt<2;attempt++){
      let channel, failureStage='request',failureDigest=null;
      try {
      if (!models.has(model) || typeof json!=='boolean'||!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>maxOutputTokens||
          reasoningEffort!==undefined&&!['none','low','medium','high'].includes(reasoningEffort)||
          temperature!==undefined&&(!Number.isFinite(temperature)||temperature<0||temperature>2)||!Array.isArray(messages)||messages.length<1||messages.length>100||
          messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')||
          messages.reduce((n,m)=>n+m.content.length,0)>maxPromptChars)throw new Error('unapproved private AI request');
      failureStage='attestation';
      channel=await connectVerified();
      if (!channel || channel.verified!==true || channel.productionOs!==true || channel.expectedComposeHash!==true ||
          typeof channel.sessionFor!=='function'||
          typeof channel.requestSerialized!=='function'||typeof channel.verifyReceipt!=='function') throw new Error('attested AI channel unavailable');
      // Serving sessions rotate in seconds, so bind this request to a session
      // resolved now (live discovery) rather than a boot-time pin.
      failureStage='session';
      const sessionIds=typeof channel.sessionsFor==='function'?await channel.sessionsFor(model):[await channel.sessionFor(model)];
      if(!Array.isArray(sessionIds)||sessionIds.length<1||sessionIds.length>16||sessionIds.some(id=>typeof id!=='string'||!/^[0-9a-f]{64}$/.test(id))||new Set(sessionIds).size!==sessionIds.length)throw new Error('attested AI session unavailable');
      const sessionId=sessionIds[0];
      // Request travels only over the verified transport object, never a
      // separate caller-controlled fetch. This canonical digest is an expected
      // value for the independent signed-receipt verifier.
      const selectedEffort=reasoningEffort??(disableReasoning?'none':undefined);
      const body={model,messages,max_tokens:maxTokens,
        ...(selectedEffort?{reasoning_effort:selectedEffort}:{}),
        ...(temperature!==undefined?{temperature}:{}),
        ...(json?{response_format:{type:'json_object'}}:{}),
        provider:{...ROUTING,aci_session_ids:sessionIds}};
      const serialized=JSON.stringify(body); // immutable UTF-8 wire contract
      const requestDigest=createHash('sha256').update(serialized,'utf8').digest('hex');failureDigest=requestDigest;
      failureStage='completion';
      const result=await channel.requestSerialized(serialized,{contentType:'application/json'});
      const expected={requestDigest,sessionId,sessionIds,model};
      failureStage='receipt';
      const receipt=await channel.verifyReceipt(result,expected);
      if (!receipt || receipt.verified!==true || receipt.required!==true ||
          receipt.requestDigest!==requestDigest || !sessionIds.includes(receipt.sessionId) || receipt.model!==model)
        throw new Error('attested AI receipt unavailable');
      // Attach receipt-bound usage for the metered wrapper. Only present when
      // the completion exposes safe integer token counters.
      const usage=result?.usage;
      if (usage && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens>=0 &&
          Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens>=0 &&
          typeof receipt.responseDigest==='string') {
        Object.defineProperty(result,PRIVATE_USAGE,{enumerable:false,value:Object.freeze({
          model,requestDigest,responseDigest:receipt.responseDigest,receiptId:receipt.receiptId??null,
          ...(refusalProofs.length?{refusalProofs:structuredClone(refusalProofs)}:{}),
          inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,
          costMicroUsd:Number.isFinite(usage.cost)&&usage.cost>=0?Math.ceil(usage.cost*1_000_000):null,
        })});
      }
      return result;
      } catch (cause) {
        const refusal=cause?.[PRIVATE_ACI_REFUSAL];
        if(failureStage==='completion'&&refusal){
          refusalProofs.push(refusal);
          if(attempt===0)continue; // Only a signed no-forwarding refusal can replay.
        }
        // The existing worker persists error.message in steps/events. Never
        // let a provider exception carrying prompt text reach that sink.
        const error=new Error('Private AI unavailable');
        error.code='PHALA_PRIVATE_AI_UNAVAILABLE';
        error.failureStage=failureStage;
        // Local control flow proves requestSerialized was never invoked.
        // A provider response or arbitrary error string cannot set this marker.
        if(['request','attestation','session'].includes(failureStage)||refusal)Object.defineProperty(error,PRIVATE_NOT_DISPATCHED,{value:true,enumerable:false});
        if(failureStage==='completion'&&['PHALA_PRIVATE_AI_REQUEST_REJECTED','PHALA_PRIVATE_AI_SESSION_EXPIRED','PHALA_PRIVATE_AI_CREDENTIAL_REJECTED','PHALA_PRIVATE_AI_RATE_LIMITED','PHALA_PRIVATE_AI_UPSTREAM_UNAVAILABLE'].includes(cause?.privateCompletionReason))error.privateCompletionReason=cause.privateCompletionReason;
        if(cause?.[PRIVATE_ACI_FAILURE]||failureStage==='completion'&&failureDigest)Object.defineProperty(error,PRIVATE_FAILURE_EVIDENCE,{value:cause?.[PRIVATE_ACI_FAILURE]??{format:'drnib-aci-failure-v1',model,requestDigest:failureDigest,httpStatus:null},enumerable:false});
        if(refusalProofs.length)Object.defineProperty(error,PRIVATE_REFUSAL_EVIDENCE,{value:structuredClone(refusalProofs),enumerable:false});
        throw error;
      } finally {
        try {await channel?.close?.()} catch {}
      }
      }
    },
  });
}
