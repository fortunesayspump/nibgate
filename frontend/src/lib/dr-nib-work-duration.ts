export type DrNibActiveWork={format:'drnib-active-work-v1';durationMs:number;observedAt:string;running:boolean};
export function validDrNibActiveWork(value:any):value is DrNibActiveWork{
 return value?.format==='drnib-active-work-v1'&&Number.isSafeInteger(value.durationMs)&&value.durationMs>=0&&typeof value.observedAt==='string'&&Number.isFinite(Date.parse(value.observedAt))&&typeof value.running==='boolean';
}
/** Advance only a fresh worker observation, never an owner wait or an
 * unbounded offline interval. The next authenticated heartbeat resynchronizes. */
export function drNibWorkDuration(run:any,now=Date.now(),workerPaused=false){
 const value=run?.activeWork;if(!validDrNibActiveWork(value))return null;
 const live=value.running&&run.status==='running'&&!workerPaused&&!run.metadata?.privateRecoveryRequestId&&!run.metadata?.privateUncertainRequestId;
 const ms=value.durationMs+(live?Math.min(30000,Math.max(0,now-Date.parse(value.observedAt))):0);
 const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
 return {ms,label:hours?`${hours}h ${minutes}m ${seconds%60}s`:minutes?`${minutes}m ${seconds%60}s`:`${seconds}s`,live};
}
