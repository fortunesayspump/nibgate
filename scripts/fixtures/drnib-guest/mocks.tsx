// Test-only guest boundary: synthetic planning results, never real inference or funds.
export * from '../drnib-signin/mocks';
export {default} from '../drnib-signin/mocks';
import React from 'react';
import {state as auth, drNibApi as signedInApi} from '../drnib-signin/mocks';
const initial=(window as any).__guestInitial??{};
if(initial.authenticated===true)auth.authenticated=true;
export const guestState={enabled:true,expiresAt:new Date(Date.now()+3600000).toISOString(),limits:{ttlMs:3600000,maxReplans:3},restoreErrorCode:null as null|string,requests:[] as string[],snapshots:[] as any[],draft:null as any,run:null as any,adoptions:0,adopted:false,stale:false,adoptionFails:false,delayIntake:false,delayPlan:false,delaySave:false,resolveSave:null as null|(()=>void),intakeFails:false,intakeFailsWithRun:false,resolveIntake:null as null|(()=>void),resolvePlan:null as null|(()=>void),storageFails:false,restoreFails:false,unknownValidation:false,funding:0,approvals:0,escrowReads:0,...initial};
(window as any).__guestTest=guestState;
const question=initial.question??{seq:0,key:'scope',type:'free',prompt:'Synthetic guest scope question',options:[],allowOther:false};
export const privateFundingEnabled=()=>true;
export const guestPlanningCapabilities=async()=>({enabled:guestState.enabled,limits:guestState.limits});
export const isGuestProject=(id:string)=>id==='guest-test-run'&&!guestState.adopted;
export async function beginGuestPlanning(topic:string){
 guestState.requests.push('intake');
 if(guestState.delayIntake)await new Promise<void>(resolve=>{guestState.resolveIntake=resolve;});
 if(guestState.intakeFails){if(guestState.intakeFailsWithRun)guestState.run={id:'guest-test-run',status:'intake',brief:{topic}};throw Object.assign(Error('Guest planning is temporarily unavailable. Your saved question remains on this device.'),guestState.intakeFailsWithRun?{privateRunId:'guest-test-run'}:{});}
 guestState.run={id:'guest-test-run',title:topic,status:'intake',brief:{topic},questions:[question],decisions:[{kind:'question',seq:0,question}]};
 return guestState.run;
}
export async function persistGuestDraft({snapshot}:{snapshot:Record<string,unknown>}){
 if(guestState.storageFails)throw new Error('Synthetic storage unavailable');
 if(guestState.delaySave)await new Promise<void>(resolve=>{guestState.resolveSave=resolve;});
 guestState.snapshots.push(structuredClone(snapshot));
 guestState.draft={runId:guestState.run?.id??null,snapshot:structuredClone(snapshot),expiresAt:guestState.expiresAt,limits:guestState.limits,planningExpired:Date.parse(guestState.expiresAt)<=Date.now()};
 return guestState.draft;
}
export const saveGuestComposerSnapshot=(snapshot:Record<string,unknown>)=>persistGuestDraft({snapshot});
export const restoreGuestDraft=async()=>guestState.draft;
export const restoreGuestComposerSnapshot=restoreGuestDraft;
export async function adoptGuestProject(id:string){
 guestState.adoptions++;
 if(!auth.authenticated)throw Object.assign(new Error('Sign in required'),{status:401});

 if(guestState.adoptionFails)throw new Error('Adoption could not be confirmed. Your guest draft is retained.');
 guestState.adopted=true;
 guestState.run={...guestState.run,id:'account-test-run',...(!guestState.unknownValidation?{guestAdoptionValidation:{ready:!guestState.stale,reason:guestState.stale?'Synthetic expired plan requires explicit replan.':null}}:{})};
 return guestState.run;
}
export const drNibApi={...signedInApi,
 answerBatch:async(_id:string,answers:any[])=>{
  guestState.requests.push('answers');guestState.answers=structuredClone(answers);guestState.run={...guestState.run,status:'intake-done',decisions:[{kind:'question',seq:0,question,answer:answers[0]?.answer}]};
  return {done:!guestState.moreQuestions,next:guestState.moreQuestions?[{...question,seq:1,key:'follow-up',prompt:'Synthetic follow-up question'}]:[],thinkings:[{seq:0,thinking:'Synthetic response from mocked confidential worker.'}],project:guestState.run};
 },
 finishIntake:async()=>{guestState.requests.push('finish-intake');guestState.run={...guestState.run,status:'intake-done'};return guestState.run;},
 configureRun:async(_id:string,config:any)=>{
  guestState.requests.push('configure');if(guestState.delayPlan)await new Promise<void>(resolve=>{guestState.resolvePlan=resolve;});guestState.run={...guestState.run,status:'planned',brief:{...guestState.run.brief,...config},plan:{source:'model',estimate:0.5,minimumFunding:0.5,sub_questions:['Synthetic worker-generated plan step'],createdAt:new Date().toISOString()}};return guestState.run;
 },
 getRun:async()=>{if(guestState.restoreFails)throw Object.assign(Error('Synthetic restore offline'),{code:guestState.restoreErrorCode});return guestState.run;},
 editPlan:async(_id:string,steps:string[])=>{guestState.requests.push('edit-plan');guestState.run.plan.sub_questions=steps;return guestState.run;},
 getEscrow:async()=>{guestState.escrowReads++;return {configured:true,job:null};},
 approve:async()=>{guestState.approvals++;return guestState.run;},
};
export const SourceManager=()=> <div data-testid="authenticated-source-manager">Authenticated private upload control</div>;
export const EscrowDeposit=()=> <button onClick={()=>{guestState.funding++;}}>Test-only explicit fund</button>;

// Classification is a mocked presentation boundary; real classifier has separate unit tests.
export function classifyGuestPlanningError(error:any){if(error?.code==='GUEST_SESSION_EXPIRED')return {kind:'expired',message:'Guest planning has ended. Your local draft is still saved. Sign in to try saving it to your account.',retryRestore:false};return {kind:'retry',message:'The saved project could not be loaded. Your local draft has not been replaced. You can explicitly retry loading it.',retryRestore:true};}

export const privateAction=async(_id:string,action:string)=>{if(action!=='intake')throw Error('Unexpected synthetic private action');guestState.requests.push('intake-retry');guestState.run={...guestState.run,questions:[question]};return guestState.run;};
