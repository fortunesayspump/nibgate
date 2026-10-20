import {withPrivateLlmPort} from '../llm/provider.js';
import {PRIVATE_USAGE,PRIVATE_METERED_COST} from './phala-ai-port.js';
import {privateActionFailure} from './private-action-failure.js';
// Existing generators may request concurrent sections or repair known-invalid
// JSON. Serialize this action's calls; once a call has an unknown outcome, its
// durable reservation and this latch prohibit further paid calls in the action.
export function createPrivateGeneration({infer,run,actionId}){
    let tail=Promise.resolve(),failed=false,lastFailure=null;
    const execute=(stage,operation)=>withPrivateLlmPort({privateVerifiedTransport:'phala-aci-v1',chat:options=>{
        const next=tail.then(async()=>{
            if(failed)throw Error('Private generation unavailable');
            let result;
            try{result=await infer({run,actionId,messages:options.messages,json:options.json===true,stage,temperature:options.temperature,maxTokens:stage==='review'?2048:options.maxTokens});}
            catch(error){failed=true;lastFailure=privateActionFailure(error).error;throw Error(lastFailure);}
            const choice=result?.choices?.[0],usage=result?.[PRIVATE_USAGE];
            if(choice?.finish_reason==='length'){lastFailure='PRIVATE_MODEL_OUTPUT_TRUNCATED';throw Error(lastFailure);}
            if(typeof choice?.message?.content!=='string'){lastFailure='PRIVATE_MODEL_OUTPUT_INVALID';throw Error(lastFailure);}
            const cost=result[PRIVATE_METERED_COST];
            return {text:choice.message.content,finishReason:choice.finish_reason??null,model:usage?.model??'confidential',
                usage:usage?{promptTokens:usage.inputTokens,completionTokens:usage.outputTokens,totalTokens:usage.inputTokens+usage.outputTokens,costUsd:typeof cost==='number'?cost/1000000:null}:null,raw:{}};
        });
        tail=next.catch(()=>{});return next;
    }},async()=>{try{const result=await operation();if(result?.source==='fallback'&&lastFailure)throw Error(lastFailure);return result;}catch(error){if(lastFailure)throw Error(lastFailure);throw error;}finally{await tail}});
    return execute;
}
