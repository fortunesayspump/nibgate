/** Browser coordination only. Eligibility permits an attested journal check,
 * never bypasses guest fencing, complete-result or unresolved-payment checks. */
export function canCheckPrivateRecovery(state:any,funding:any){
 return typeof state?.metadata?.privateRecoveryRequestId==='string'&&/^[0-9a-f-]{36}$/i.test(state.metadata.privateRecoveryRequestId)&&funding?.job?.status==='Funded'&&!funding.cancelled&&!funding.job.cancelled;
}
export function admitAutomaticPrivateRecovery(storage:Pick<Storage,'getItem'|'setItem'>,runId:string,requestId:string){
 if(!/^[0-9a-f-]{36}$/i.test(runId)||!/^[0-9a-f-]{36}$/i.test(requestId))return false;
 try{const key='drnib-private-recovery-once-v1:'+runId;if(storage.getItem(key)===requestId)return false;storage.setItem(key,requestId);return true;}catch{return false;}
}
export function privateRecoveryRoot(manifest:any,activity:any):string|null{
 const root=manifest?.privateCheckpoint?.rootRequestId??(['processing','uncertain'].includes(activity?.state)?activity.requestId:null);
 return typeof root==='string'&&/^[0-9a-f-]{36}$/i.test(root)?root:null;
}
