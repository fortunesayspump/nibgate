import {createHash} from 'node:crypto';
import {planMessages} from '../llm/prompts.js';
import {resolveLength} from '../length.js';
import {createFullWorkerPrivateContext} from './full-worker-context.js';

// A single real Dr. Nib stage, not a second research engine: prompt and length
// policy are the existing worker's. Only the model transport and persistence
// are private. No ordinary provider, DB singleton, eventlog or fallback import.
function denied(){const error=new Error('PRIVATE_PLAN_UNAVAILABLE');error.code='PRIVATE_PLAN_UNAVAILABLE';return error;}
function disabled(){throw denied();}
function cleanStrings(value,max){
  if(!Array.isArray(value)||value.length>max)return null;
  const out=[];
  for(const item of value){if(typeof item!=='string'||item.length>600)return null;const trimmed=item.trim();if(trimmed)out.push(trimmed);}
  return out;
}
function validState(state){
  const brief=state?.brief;
  if(!state||typeof state!=='object'||Array.isArray(state)||!brief||typeof brief!=='object'||Array.isArray(brief)||
     typeof brief.topic!=='string'||brief.topic.trim().length<3||brief.topic.length>1000||brief.liveWeb!==false)return false;
  const guidance=state.pendingGuidance;
  return guidance==null||(typeof guidance==='object'&&!Array.isArray(guidance)&&
    typeof guidance.text==='string'&&guidance.text.length<=8000);
}
function inputDigest(state){
  const brief=state.brief,guidance=state.pendingGuidance??null;
  return createHash('sha256').update(JSON.stringify({brief,guidance})).digest('hex');
}
function parsePlan(completion,inputDigest,model){
  const text=completion?.choices?.[0]?.message?.content;
  if(typeof text!=='string'||text.length<2||text.length>20000)throw denied();
  let data;
  try{data=JSON.parse(text);}catch{throw denied();}
  const sub_questions=cleanStrings(data?.sub_questions,12);
  const uncertainties=cleanStrings(data?.uncertainties??[],4);
  const sources=data?.estimate?.sources,rationale=data?.estimate?.rationale;
  if(!sub_questions?.length||!uncertainties||!Number.isSafeInteger(sources)||sources<0||sources>1000||
     typeof rationale!=='string'||rationale.length>800)throw denied();
  return {sub_questions,uncertainties,estimate:sources,why:rationale.trim(),source:'llm',model,inputDigest};
}

/** Creates a planning-only runner. All unrelated capabilities are explicitly
 * denied; an unavailable attested model parks instead of using the legacy
 * provider or the conventional deterministic placeholder. */
export function createPrivatePlanRunner({store,events,aiPort,model}={}){
  if(typeof store?.getRunState!=='function'||typeof store?.commitPlan!=='function'||
     typeof aiPort?.infer!=='function'||aiPort.privateVerifiedTransport!=='phala-aci-v1'||
     typeof model!=='string'||!model)throw denied();
  const ai={generate:messages=>aiPort.infer({model,messages}),verify:disabled};
  const judge={sourceBatch:disabled,choice:disabled};
  const tools={run:disabled};
  const billing={meter:disabled};
  const context=createFullWorkerPrivateContext({store,events,ai,judge,tools,billing});
  return Object.freeze({
    async run(runId){
      try{
        let run=await store.loadRun(runId);
        let loaded=await store.getRunState(run);
        if(!loaded||!Number.isSafeInteger(loaded.revision)||loaded.revision<1||!validState(loaded.state))throw denied();
        const attempt=run.versions;
        if(!Number.isSafeInteger(attempt)||attempt<1)throw denied();
        if(loaded.state.plan?.stageAttempt===attempt){
          if(run.status!=='planned')throw denied();
          return loaded.state.plan;
        }
        if(run.status!=='planning')throw denied();
        const originalDigest=inputDigest(loaded.state);
        const output=await context.stage(runId,'plan',attempt,async({ai})=>{
          const brief=loaded.state.brief;
          const target=resolveLength({length:brief.length,lengthWords:brief.lengthWords});
          const messages=planMessages({brief,guidance:loaded.state.pendingGuidance??null,
            sections:target.sections,words:target.words});
          const completion=await ai.generate(messages);
          return parsePlan(completion,originalDigest,model);
        });
        if(output?.inputDigest!==originalDigest)throw denied();
        // A completed stage may be replayed after a crash before the state
        // commit. Preserve newer unrelated state, but never apply a plan to
        // changed brief/guidance. The checkpoint prevents another model call.
        for(let i=0;i<3;i++){
          run=await store.loadRun(runId);
          loaded=await store.getRunState(run);
          if(!loaded||!validState(loaded.state)||inputDigest(loaded.state)!==originalDigest)throw denied();
          if(loaded.state.plan?.stageAttempt===attempt){
            if(run.status!=='planned')throw denied();
            return loaded.state.plan;
          }
          if(run.status!=='planning')throw denied();
          const nextState={...loaded.state,plan:{...output,stageAttempt:attempt},pendingGuidance:null};
          if(loaded.state.pendingGuidance?.text){
            nextState.brief={...loaded.state.brief,guidance:[loaded.state.brief.guidance,loaded.state.pendingGuidance.text]
              .filter(Boolean).join('\n').slice(-8000)};
          }
          try{
            await store.commitPlan(run,{attempt,expectedRevision:loaded.revision,nextState});
            return nextState.plan;
          }catch(error){if(error?.code!=='PRIVATE_STATE_CONFLICT')throw error;}
        }
        throw denied();
      }catch{throw denied();}
    },
  });
}
