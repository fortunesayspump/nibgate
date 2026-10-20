import {privateModelSessionMatches} from '../backend/src/privacy/private-model-session.js';
// Reviewed candidates, not a claim that every model is serving or qualified.
// USD-millionths per million tokens. Recheck live prices before admission.
export const PRIVATE_MODEL_CANDIDATES=Object.freeze([
 {id:'phala/gemma-4-26b-a4b-uncensored',input:150000,output:700000,reasoningEffort:false},
 {id:'qwen/qwen3.8-27b',input:200000,output:2500000,reasoningEffort:true},
 {id:'qwen/qwen-2.5-7b-instruct',input:100000,output:200000,reasoningEffort:false},
 {id:'google/gemma-4-31b-it',input:150000,output:460000,reasoningEffort:false},
 {id:'z-ai/glm-5.3-flash',input:150000,output:500000,reasoningEffort:false},
 {id:'openai/gpt-oss-120b',input:150000,output:600000,reasoningEffort:true},
].map(Object.freeze));
function price(value){
 if(typeof value!=='string'||!/^\d+(?:\.\d{1,12})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');const scaled=BigInt(whole)*1000000000000n+BigInt(fraction.padEnd(12,'0'));
 return scaled<=BigInt(Number.MAX_SAFE_INTEGER)?Number(scaled):null;
}
/** Selection only, before dispatch. The inference port must still verify the
 * serving session and exact response receipt. Never replay an uncertain call.
 * qualityApproved is independent of provider availability and price metadata. */
export function availablePrivateModels({models,sessions,qualityApproved=[],remainingMicroUsd,inputTokens,outputTokens,nowMs=Date.now(),cooldowns={},uncertainAction=false}){
 if(uncertainAction)throw Error('PRIVATE_WORKFLOW_ACTION_UNCERTAIN');
 if(!Array.isArray(models)||!Array.isArray(sessions)||!Array.isArray(qualityApproved)||![remainingMicroUsd,inputTokens,outputTokens,nowMs].every(Number.isSafeInteger)||remainingMicroUsd<0||inputTokens<1||outputTokens<1)throw Error('PRIVATE_MODEL_SELECTION_INVALID');
 return PRIVATE_MODEL_CANDIDATES.flatMap(candidate=>{
  if(!qualityApproved.includes(candidate.id)||Number(cooldowns[candidate.id]??0)>nowMs)return [];
  const model=models.find(m=>m.id===candidate.id&&m.is_tee===true);
  if(!model||!['max_tokens','response_format'].every(p=>model.supported_parameters?.includes(p)))return [];
  const input=price(model.pricing?.prompt),output=price(model.pricing?.completion);
  if(input===null||output===null||input>candidate.input||output>candidate.output||!Number.isSafeInteger(model.max_output_length)||model.max_output_length<outputTokens)return [];
  const ids=[...new Set(sessions.filter(s=>privateModelSessionMatches(s,candidate.id)&&/^[0-9a-f]{64}$/.test(s.session_id??'')&&Number.isSafeInteger(s.expires_at)&&s.expires_at*1000>nowMs+5000).map(s=>s.session_id))].slice(0,16);
  if(!ids.length)return [];
  const reserve=(BigInt(inputTokens)*BigInt(candidate.input)+BigInt(outputTokens)*BigInt(candidate.output)+999999n)/1000000n;
  if(reserve>BigInt(remainingMicroUsd))return [];
  return [{...candidate,sessionIds:ids,reservedMicroUsd:Number(reserve)}];
 }).sort((a,b)=>a.reservedMicroUsd-b.reservedMicroUsd);
}
