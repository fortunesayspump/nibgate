import {PRIVATE_USAGE} from './phala-ai-port.js';
export const OPENROUTER_ZDR_MODEL='openai/gpt-4o-mini';
export function createOpenRouterZdrPort({apiKey,reviewExpiresAtMs,fetchImpl=fetch}){
 if(typeof apiKey!=='string'||!apiKey||!Number.isSafeInteger(reviewExpiresAtMs))throw Error('HOSTED_RESEARCH_POLICY_INVALID');
 return Object.freeze({privateVerifiedTransport:'openrouter-zdr-v1',async infer({model,messages,json,maxTokens,temperature}){
  if(Date.now()>=reviewExpiresAtMs||model!==OPENROUTER_ZDR_MODEL)throw Error('HOSTED_RESEARCH_POLICY_EXPIRED');
  const response=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify({model,messages,max_completion_tokens:maxTokens,temperature,...(json?{response_format:{type:'json_object'}}:{}),provider:{only:['Azure'],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny'}})});
  if(!response.ok){await response.body?.cancel();throw Error('HOSTED_RESEARCH_UNAVAILABLE')}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw Error('HOSTED_RESEARCH_OUTPUT_LIMIT');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8')),u=result.usage;
  if(result.model!==model||result.provider!=='Azure'||!/^gen-[A-Za-z0-9-]{1,180}$/.test(result.id??'')||!u||!Number.isSafeInteger(u.prompt_tokens)||!Number.isSafeInteger(u.completion_tokens)||typeof u.cost!=='number'||!Number.isFinite(u.cost)||u.cost<0)throw Error('HOSTED_RESEARCH_USAGE_INVALID');
  Object.defineProperty(result,PRIVATE_USAGE,{value:Object.freeze({model,inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens,costMicroUsd:Math.ceil(u.cost*1000000),privacy:'hosted-provider-visible',provider:'Azure',source:'OpenRouter-ZDR'})});
  return result;
 }});
}
