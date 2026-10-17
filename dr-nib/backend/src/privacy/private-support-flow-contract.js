import {assertPrivateWorkerRun} from './private-worker-store.js';

// Future-only whole-run support-judging admission contract. The currently deployed source-only
// composition is deliberately not wired here and remains unverified.
export const PRIVATE_SUPPORT_FLOW_CALLS=Object.freeze({plan:1,write:2,extract:24,judge:3,total:30});
const PROMPT_BYTES=150000;
const OUTPUT_TOKENS=1200;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function denied(){const error=new Error('PRIVATE_SUPPORT_FLOW_UNAVAILABLE');error.code='PRIVATE_SUPPORT_FLOW_UNAVAILABLE';return error;}

/** A callable integration contract for a later measured source-only verified
 * flow. Admission reserves the worst-case plan+write+extraction+support calls
 * before the first model call. One stage cannot borrow another's call budget.
 * The budget settles before a separate, audited completion transaction may
 * release browser ciphertext. Current budget policy rejects 30 calls and the
 * current completion method rejects verification steps; both intentionally
 * keep this future contract disabled in the live guest. */
export function createPrivateSupportFlowContract({loadRun,budget,aiPort,model,stages,complete}={}){
  if(typeof loadRun!=='function'||typeof budget?.run!=='function'||
     typeof aiPort?.infer!=='function'||aiPort.privateVerifiedTransport!=='phala-aci-v1'||
     typeof model!=='string'||!model||typeof complete!=='function'||
     !stages||['plan','write','extract','judge'].some(name=>typeof stages[name]!=='function'))throw denied();
  return Object.freeze({
    async run({runId,tenantId}={}){
      try{
        if(!UUID.test(runId)||typeof tenantId!=='string'||!tenantId)throw denied();
        const run=assertPrivateWorkerRun(await loadRun(runId),runId,tenantId);
        if(run.status!=='draft'||run.userId!==tenantId)throw denied();
        const judgment=await budget.run({runId,tenantId,model,
          maxCalls:PRIVATE_SUPPORT_FLOW_CALLS.total,
          maxPromptBytesPerCall:PROMPT_BYTES,maxOutputTokensPerCall:OUTPUT_TOKENS,
          execute:async({infer})=>{
            if(typeof infer!=='function')throw denied();
            async function stage(name){
              let active=true,calls=0;
              const port=Object.freeze({privateVerifiedTransport:'phala-aci-v1',
                infer:async({model:requested,messages})=>{
                  if(!active||requested!==model||calls>=PRIVATE_SUPPORT_FLOW_CALLS[name])throw denied();
                  calls++;
                  return infer({messages,dispatch:async bounded=>{
                    if(bounded?.model!==model||bounded.maxOutputTokens!==OUTPUT_TOKENS||
                       !Array.isArray(bounded.messages))throw denied();
                    return {value:await aiPort.infer({model:bounded.model,messages:bounded.messages})};
                  }});
                },
              });
              // The support runner normally requests its own budget.run.
              // When composed under this whole-run reservation, hand it a
              // one-use child permit rather than opening a second reservation
              // for the same run. Every child dispatch still traverses the
              // enclosing metered port and the stage call-count cap.
              let childUsed=false,childCalls=0;
              const childBudget=Object.freeze({run:async request=>{
                if(!active||childUsed||request?.runId!==runId||request.tenantId!==tenantId||
                   request.model!==model||!Number.isSafeInteger(request.maxCalls)||request.maxCalls<1||
                   request.maxCalls>PRIVATE_SUPPORT_FLOW_CALLS[name]||
                   !Number.isSafeInteger(request.maxPromptBytesPerCall)||
                   request.maxPromptBytesPerCall<1||request.maxPromptBytesPerCall>PROMPT_BYTES||
                   request.maxOutputTokensPerCall!==OUTPUT_TOKENS||
                   typeof request.execute!=='function')throw denied();
                childUsed=true;
                return request.execute({infer:async({messages,dispatch})=>{
                  if(!active||childCalls>=request.maxCalls||typeof dispatch!=='function'||
                     !Array.isArray(messages)||Buffer.byteLength(JSON.stringify(messages),'utf8')>
                       request.maxPromptBytesPerCall)throw denied();
                  childCalls++;
                  const response=await dispatch({model,messages,maxOutputTokens:OUTPUT_TOKENS});
                  if(!response||typeof response!=='object'||!Object.prototype.hasOwnProperty.call(response,'value'))
                    throw denied();
                  return response.value;
                }});
              }});
              try{return await stages[name]({runId,tenantId,aiPort:port,budget:childBudget});}
              finally{active=false;}
            }
            await stage('plan');
            await stage('write');
            const extraction=await stage('extract');
            if(extraction?.scope!=='extraction-only'||extraction.verified!==false||
               extraction.reportCoverageComplete!==true)throw denied();
            const result=await stage('judge');
            if(result?.committed!==true||result.verified!==false||
               !Number.isSafeInteger(result.claims)||result.claims<0||
               !Number.isSafeInteger(result.supported)||result.supported<0||result.supported>result.claims||
               result.unknown!==result.claims-result.supported)throw denied();
            return result;
          },
        });
        // This callback must itself freshly lock/check the sealed verification
        // manifest, source/report, recipient, owner and run status. It must
        // never point at ordinary ResearchClaim or a plaintext report.
        const receipt=await complete({runId,tenantId,judgment});
        if(!receipt||Object.keys(receipt).sort().join(',')!=='encrypted,id,version'||
           receipt.id!==runId||receipt.version!==1||receipt.encrypted!==true)throw denied();
        return receipt;
      }catch{throw denied();}
    },
  });
}
