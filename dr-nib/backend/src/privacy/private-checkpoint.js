import {createHmac} from 'node:crypto';
import {PRIVATE_USAGE,PRIVATE_METERED_COST,PRIVATE_CALL_CHARGE,PRIVATE_NOT_DISPATCHED} from './phala-ai-port.js';
import {validatePrivateExternalRequest} from '@nibgate/internal/private-tools.js';

export const PRIVATE_PAUSED='PRIVATE_ACTION_PAUSED';
export const PRIVATE_AWAITING='PRIVATE_ACTION_AWAITING';
const limit=2*1024*1024;
const fail=()=>Error('PRIVATE_CHECKPOINT_UNCERTAIN');
function canonical(value){
 if(value===undefined)return null;
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
 if(typeof value==='number'&&!Number.isFinite(value))throw fail();
 return value;
}
function pack(value){return {value,usage:value?.[PRIVATE_USAGE]??null,cost:value?.[PRIVATE_METERED_COST]??null,charge:value?.[PRIVATE_CALL_CHARGE]??null};}
function unpack(record){const value=structuredClone(record.value);if(record.usage)Object.defineProperty(value,PRIVATE_USAGE,{value:record.usage});if(record.cost!==null)Object.defineProperty(value,PRIVATE_METERED_COST,{value:record.cost});if(record.charge)Object.defineProperty(value,PRIVATE_CALL_CHARGE,{value:record.charge});return value;}
/** Encrypted deterministic operation replay. A started operation without a
 * durable result is never replayed directly. Admission may fence an expired
 * worker and replace only an interrupted model completion after retaining its
 * entire unknown charge under the operator cap; tools stay non-replayable. */
export function createPrivateCheckpoint({key,value,save,fence,controls=async()=>[]}){
 if(!(key instanceof Uint8Array)||key.length!==32||typeof save!=='function'||typeof fence!=='function'||value?.format!=='drnib-checkpoint-v1'||!Array.isArray(value.entries))throw fail();
 let cursor=0,tail=Promise.resolve();
 const persist=async()=>{if(Buffer.byteLength(JSON.stringify(value))>limit)throw Error('PRIVATE_CHECKPOINT_LIMIT');await save(value);};
 const execute=async(kind,request,perform)=>{
  await fence();
  const {run,actionId,...input}=request??{};
  const digest=createHmac('sha256',key).update(JSON.stringify(canonical({kind,input}))).digest('hex');
  const prior=value.entries[cursor++];
  if(prior){if(prior.digest!==digest||prior.kind!==kind||prior.state!=='complete')throw fail();return unpack(prior.result);}
  value.consumed??=[];
  for(const control of await controls()){
   if(value.consumed.includes(control.id))continue;
   value.consumed.push(control.id);
   if(control.command==='guidance'){
    const guidance=[value.guidance,control.text].filter(Boolean).join('\n\n');
    if(guidance.length>8000)throw Error('PRIVATE_CHECKPOINT_LIMIT');
    value.guidance=guidance;
   }
   if(control.command==='pause'){await persist();throw Error(PRIVATE_PAUSED);}
  }
  if(value.entries.length>=128||Buffer.byteLength(JSON.stringify(value))>limit-512*1024)throw Error('PRIVATE_CHECKPOINT_LIMIT');
  const entry={kind,digest,state:'started'};value.entries.push(entry);await persist();
  let actual=request;
  if(value.guidance&&kind==='infer')actual={...request,messages:[...request.messages,{role:'user',content:'Owner guidance for remaining work: '+value.guidance}]};
  if(value.guidance&&kind==='judge')actual={...request,request:{...request.request,state:{context:request.request.state,ownerGuidance:value.guidance}}};
  let result;
  try{result=await perform(actual);}catch(error){
   if(error?.[PRIVATE_NOT_DISPATCHED]===true){value.entries.pop();cursor--;await persist();}
   throw error;
  }
  entry.result=pack(result);entry.state='complete';await persist();return result;
 };
 const ownerQuestion=async request=>{
  await fence();
  if(!request||Object.keys(request).some(k=>!['prompt','why','options','externalRequest'].includes(k))||typeof request.prompt!=='string'||!request.prompt.trim()||request.prompt.length>1000||request.why!==undefined&&(typeof request.why!=='string'||request.why.length>500)||request.options!==undefined&&(!Array.isArray(request.options)||request.options.length>6||request.options.some(o=>!o||Object.keys(o).sort().join(',')!=='id,label'||typeof o.id!=='string'||!/^[a-z0-9_-]{1,40}$/i.test(o.id)||typeof o.label!=='string'||o.label.length>160)))throw Error('PRIVATE_QUESTION_INVALID');
  if(request.options&&new Set(request.options.map(o=>o.id)).size!==request.options.length)throw Error('PRIVATE_QUESTION_INVALID');
  if(request.externalRequest)validatePrivateExternalRequest(request.externalRequest);
  const digest=createHmac('sha256',key).update(JSON.stringify(canonical({kind:'owner-answer',input:request}))).digest('hex');
  let entry=value.entries[cursor++];
  if(entry){if(entry.kind!=='owner-answer'||entry.digest!==digest)throw fail();if(entry.state==='complete')return unpack(entry.result);if(entry.state!=='waiting')throw fail();}
  else{
   if(value.entries.length>=128||value.entries.filter(e=>e.kind==='owner-answer'&&Boolean(e.question?.externalRequest)===Boolean(request.externalRequest)).length>=(request.externalRequest?12:3))throw Error('PRIVATE_CHECKPOINT_LIMIT');
   entry={kind:'owner-answer',digest,state:'waiting',question:{...request,id:digest}};value.entries.push(entry);await persist();
  }
  const error=Error(PRIVATE_AWAITING);error.question=structuredClone(entry.question);throw error;
 };
 const queued=operation=>{const next=tail.then(operation);tail=next.catch(()=>{});return next;};
 return {value,operation:(kind,request,perform)=>queued(()=>execute(kind,request,perform)),ownerQuestion:request=>queued(()=>ownerQuestion(request)),flush:persist};
}

export function answerPrivateCheckpoint(value,args){
 const waiting=value.entries?.filter(e=>e.kind==='owner-answer'&&e.state==='waiting');
 if(waiting?.length!==1||!args||Object.keys(args).some(k=>!['questionId','text','optionId','toolCallId','toolResult'].includes(k))||args.questionId!==waiting[0].question.id||
    (typeof args.text==='string'&&args.text.trim()?args.text.length>4000:typeof args.optionId!=='string')||args.text!==undefined&&typeof args.text!=='string'||args.optionId!==undefined&&!waiting[0].question.options?.some(o=>o.id===args.optionId))throw Error('PRIVATE_ANSWER_INVALID');
 const answer={...(args.text?{text:args.text.trim()}:{}),...(args.optionId?{optionId:args.optionId,label:waiting[0].question.options.find(o=>o.id===args.optionId).label}:{})};
 if(waiting[0].question.externalRequest&&args.optionId==='approve'){
  if(!/^[0-9a-f-]{36}$/i.test(args.toolCallId??'')||!args.toolResult||JSON.stringify(args.toolResult).length>128000)throw Error('PRIVATE_ANSWER_INVALID');
  Object.assign(answer,{questionId:args.questionId,toolCallId:args.toolCallId,toolResult:args.toolResult});
 }else if(args.toolCallId!==undefined||args.toolResult!==undefined)throw Error('PRIVATE_ANSWER_INVALID');
 waiting[0].state='complete';waiting[0].result=pack(answer);return value;
}
