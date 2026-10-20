import {randomUUID} from 'node:crypto';

// Native decision evidence is persisted only in encrypted guest state.
export function createPrivateJudge({state,judge,run,actionId,progress}){
 return async(request,step)=>{
  await progress('judge','JEV is judging the proposed research action through the disclosed zero-retention route.');
  const result=await judge({run,actionId,request});
  // The typed native JEV judgment, model and calibrated probabilities are
  // persisted only inside the final encrypted manifest/progress snapshot.
  let first=true;
  for(const [key,answer]of Object.entries(result.answers)){
   const candidateIndex=key.match(/^question_(\d+)$/)?.[1];
   const candidate=candidateIndex===undefined?null:request.state?.candidates?.[Number(candidateIndex)];
   const proposal=request.state?.proposal;
   const record={id:randomUUID(),kind:'decision',step,type:answer.type,createdAt:new Date().toISOString(),prompt:request.questions[key].instructions,
    context:{questionKey:key,...(candidate?{candidate:{prompt:String(candidate.prompt??'').slice(0,300)}}:{}),...(proposal?{proposal:{tool:String(proposal.tool??'').slice(0,64),why:String(proposal.why??'').slice(0,500),input:proposal.input}}:{})},
    question:{state:request.state,question:request.questions[key]},output:{...answer,decision:answer.choice,probability:answer.noul,model:result.model,source:'hosted-JEV-ZDR',privacy:result.privacy,usage:{costUsd:first?result.costMicroUsd/1000000:0,costAllocation:first?'request-total':'included-in-request'}}};
   state.decisions.push(record);
   first=false;
  }
  // Show judgments before the following tool; never claim a static stage note
  // is model reasoning. All rows remain encrypted in this snapshot.
  await progress('judge','JEV returned its decision.');
  return result.answers;
 };
}
