/** Measured worker time only. Restoring a saved clock never counts the gap
 * between workers, owner answers, or user pauses. Persisted inside ciphertext. */
export function createPrivateWorkClock({prior,monotonicNow=()=>performance.now(),wallNow=()=>Date.now()}={}){
 const base=prior?.format==='drnib-active-work-v1'&&Number.isSafeInteger(prior.durationMs)&&prior.durationMs>=0?prior.durationMs:0;
 const start=monotonicNow();let stopped;
 const snapshot=(running=true)=>({format:'drnib-active-work-v1',durationMs:base+Math.max(0,Math.floor((stopped??monotonicNow())-start)),observedAt:new Date(wallNow()).toISOString(),running:stopped===undefined&&running});
 return {snapshot,stop(){stopped??=monotonicNow();return snapshot(false);}};
}
