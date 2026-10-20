// Disposable PostgreSQL admission checks; all responses synthetic, no AI/network.
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {db} from '../src/db.js';
import {createPrivateModelPool,PRIVATE_CANARY_MODEL_POOL} from '../src/privacy/private-model-pool.js';
import {PRIVATE_NOT_DISPATCHED,PRIVATE_USAGE} from '../src/privacy/phala-ai-port.js';
const [gemma,qwen]=PRIVATE_CANARY_MODEL_POOL;
async function fixture(body){
 const id=randomUUID(),run={id,userId:'pool-pg-'+id};
 await db.researchRun.create({data:{...run,brief:{encrypted:true},metadata:{privacyMode:'confidential'},status:'planning'}});
 try{await body(run)}finally{await db.privateInferenceCall.deleteMany({where:{runId:id}});await db.researchRun.delete({where:{id}})}
}
const request=run=>({run,actionId:randomUUID(),stage:'plan',messages:[{role:'user',content:'synthetic admission fixture'}]});
it('real admission releases a proven non-dispatch reservation and accounts only the selected model',()=>fixture(async run=>{
 const seen=[],infer=createPrivateModelPool({db,monthlyCapMicroUsd:1000000000,createPort:model=>({privateVerifiedTransport:'phala-aci-v1',infer:async()=>{
  seen.push(model);
  if(model===gemma.model){const e=Object.assign(Error('fixture unavailable'),{code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:'session'});Object.defineProperty(e,PRIVATE_NOT_DISPATCHED,{value:true});throw e;}
  const result={};Object.defineProperty(result,PRIVATE_USAGE,{value:{model,inputTokens:10,outputTokens:5,costMicroUsd:1}});return result;
 }})});
 await infer(request(run));
 const rows=await db.privateInferenceCall.findMany({where:{runId:run.id}});
 expect(seen).toEqual([gemma.model,qwen.model]);
 expect(rows.find(r=>r.model===gemma.model)).toMatchObject({status:'not-dispatched',committedMicroUsd:0n});
 expect(rows.find(r=>r.model===qwen.model)).toMatchObject({status:'verified',committedMicroUsd:1n});
}));
it('real admission forbids a second model after an uncertain dispatch, including another pool instance',()=>fixture(async run=>{
 let calls=0;const build=()=>createPrivateModelPool({db,monthlyCapMicroUsd:1000000000,createPort:()=>({privateVerifiedTransport:'phala-aci-v1',infer:async()=>{calls++;throw Error('synthetic lost response')}})});
 const input=request(run);await expect(build()(input)).rejects.toThrow('synthetic lost response');
 await expect(build()(input)).rejects.toThrow('PRIVATE_WORKFLOW_ACTION_UNCERTAIN');
 expect(calls).toBe(1);expect(await db.privateInferenceCall.count({where:{runId:run.id,status:'reserved'}})).toBe(1);
}));
