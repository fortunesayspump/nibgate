import {createPrivateWorkflowAi} from './private-workflow-ai.js';
import {PRIVATE_NOT_DISPATCHED,PRIVATE_RETRYABLE_REJECTION} from './phala-ai-port.js';

// Explicit canary policy, pinned in measured compose. Candidate catalog entries
// do not become eligible merely because they are cheap or currently serving.
export const PRIVATE_CANARY_MODEL_POOL=Object.freeze([
    Object.freeze({model:'phala/gemma-4-26b-a4b-uncensored',inputPricePerMillion:150000,outputPricePerMillion:700000}),
    Object.freeze({model:'qwen/qwen3.8-27b',inputPricePerMillion:200000,outputPricePerMillion:2500000}),
]);
export function privateModelPoolPolicy(name){
    if(name==='single')return null;
    if(!['gemma-qwen-canary-v1','phala-openrouter-zdr-canary-v1'].includes(name))throw Error('PRIVATE_MODEL_POOL_INVALID');
    return PRIVATE_CANARY_MODEL_POOL;
}

/** Each candidate has its own verified port, cooldown and metered reservation.
 * Only proven non-dispatch availability failures permit trying the next one.
 * Unknown/forwarded failures, bad receipts and security failures stop the action.
 */
export function createPrivateModelPool({db,createPort,monthlyCapMicroUsd,fundingRequired=false,now=Date.now,fallbackInfer}){
    if(typeof createPort!=='function'||typeof now!=='function')throw Error('PRIVATE_MODEL_POOL_INVALID');
    const selected=typeof fallbackInfer==='function'?PRIVATE_CANARY_MODEL_POOL.slice(0,1):PRIVATE_CANARY_MODEL_POOL;
    const candidates=selected.map(candidate=>({...candidate,cooldownUntil:0,
        infer:createPrivateWorkflowAi({db,aiPort:createPort(candidate.model),...candidate,monthlyCapMicroUsd,fundingRequired,coverRejected429:typeof fallbackInfer==='function'})}));
    return async request=>{
        let lastFailure;
        for(const candidate of candidates){
            if(now()<candidate.cooldownUntil){lastFailure=candidate.lastFailure;continue;}
            try{return await candidate.infer(request)}catch(error){
                const safeAvailability=error?.[PRIVATE_NOT_DISPATCHED]===true&&(
                    error.message==='PRIVATE_WORKFLOW_RATE_LIMITED'||
                    error.code==='PHALA_PRIVATE_AI_UNAVAILABLE'&&(error.failureStage==='session'||
                        error.failureStage==='completion'&&error.privateCompletionReason==='PHALA_PRIVATE_AI_SESSION_EXPIRED'));
                const cheaperFallback=typeof fallbackInfer==='function'&&error?.[PRIVATE_NOT_DISPATCHED]===true&&['PRIVATE_WORKFLOW_CAP','PRIVATE_RUN_BUDGET_EXHAUSTED'].includes(error.message);
                if(!safeAvailability&&!cheaperFallback&&!(typeof fallbackInfer==='function'&&error?.[PRIVATE_RETRYABLE_REJECTION]===true))throw error;
                candidate.cooldownUntil=now()+60000;
                candidate.lastFailure=error;
                lastFailure=error;
            }
        }
        if(typeof fallbackInfer==='function')return fallbackInfer(request);
        if(lastFailure)throw lastFailure;
        const error=Error('PRIVATE_WORKFLOW_RATE_LIMITED');
        Object.defineProperty(error,PRIVATE_NOT_DISPATCHED,{value:true});
        throw error;
    };
}
