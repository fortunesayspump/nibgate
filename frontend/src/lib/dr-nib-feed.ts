/** Stable identities keep existing chat cards mounted when older events arrive
 * or a saved checkpoint is replayed. Array positions are not message IDs. */
export function drNibFeedKey(item:any){
 return JSON.stringify([item.t,item.d?.id??item.step?.id??item.id??item.e?.id??item.at??'',item.e?.type??'',item.e?.phase??'',item.e?.origin??'',item.e?.tool??'']);
}
export function privateResearchActivity(run:any){
 if(!run||run.status!=='running')return null;
 const event=[...(run.events??[])].reverse().find((e:any)=>['thinking','thinking.fallback'].includes(e.type)&&e.origin!=='usage');
 const labels:Record<string,string>={sources:'Reading your sources',agent:'Choosing the next research action',judge:'JEV is reviewing the action',search:'Searching approved public sources',write:'Writing the report',verify:'Checking the evidence',review:'Reviewing the research',tool:'Processing tool results'};
 return {label:labels[event?.phase]??'Preparing the next research step',phase:event?.phase??'research'};
}
/** A missing legacy ok flag is not a failure. Native exit codes and explicit
 * tool failures still take precedence over an apparently successful wrapper. */
export function drNibToolFailed(event:any){
 return event?.ok===false||event?.result?.ok===false||event?.tool==='run_terminal'&&(event.result?.timedOut===true||typeof event.result?.exitCode==='number'&&event.result.exitCode!==0);
}
/** A checkpoint can contain an already-recorded call ID. Render that saved
 * record once; preserve distinct calls and legacy records without IDs. */
export function deduplicateDrNibRows(rows:any[]){
 const seen=new Set<string>();return rows.filter(row=>{if(!row.id)return true;if(seen.has(row.id))return false;seen.add(row.id);return true;});
}
/** Awaiting events are history. Only the current saved question may invite
 * an answer; a replayed marker must not send someone to an empty composer. */
export function drNibHasPendingQuestion(run:any){
 return run?.status==='awaiting'&&typeof run.pendingQuestion?.prompt==='string'&&!!run.pendingQuestion.prompt.trim()&&!run.metadata?.privateActiveRequestId;
}
export function drNibQuestionMarker(run:any,event:any){
 const current=drNibHasPendingQuestion(run)&&!!event?.question?.id&&event.question.id===run.pendingQuestion.id;
 return current?'Waiting for your answer below.':'Earlier question pause — saved in the research history.';
}
