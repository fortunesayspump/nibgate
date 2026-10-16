const JOB=/^[A-Za-z0-9:_-]{1,128}$/;

/**
 * Single-process, ciphertext-only wake gate for one already-provisioned CVM.
 * At the deadline it aborts local work and requests provider-confirmed stop.
 * This is NOT an absolute provider billing guarantee: process/network failure
 * can defeat a local deadline. Production needs independent provider controls.
 */
export function createPhalaWakeController({api,guestReady,verifyAttestation,dispatch,
  idleMs,maxRuntimeMs,now=()=>Date.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=clearTimeout}={}) {
  if (!api || ['state','ensureRunning','gracefulShutdown','forceStop'].some(name=>typeof api[name]!=='function') ||
      typeof guestReady!=='function' || typeof verifyAttestation!=='function' ||
      (dispatch!==undefined&&typeof dispatch!=='function') ||
      !Number.isSafeInteger(idleMs)||idleMs<0||!Number.isSafeInteger(maxRuntimeMs)||maxRuntimeMs<=0)
    throw new Error('PHALA_WAKE_CONFIG_INVALID');

  let startFlight=null, stopFlight=null, hardStopFlight=null, runningSince=null, usedMs=0, ready=false;
  let pending=0, active=0, idleAt=null, generation=0, blocked=false, closed=false;
  let timer=null;
  const jobs=new Map(), activeSignals=new Set();
  const spent=()=>usedMs+(runningSince===null?0:Math.max(0,now()-runningSince));
  const exhausted=()=>spent()>=maxRuntimeMs;
  function clearTimer(){if(timer!==null){cancel(timer);timer=null}}
  function armTimer(){
    clearTimer();
    if(closed||blocked||stopFlight||hardStopFlight||runningSince===null)return;
    const budgetLeft=Math.max(0,maxRuntimeMs-spent());
    const idleLeft=!ready||idleAt===null?Infinity:Math.max(0,idleMs-(now()-idleAt));
    const delay=Math.min(budgetLeft,idleLeft);
    if(!Number.isFinite(delay))return;
    timer=schedule(()=>{timer=null;void tick().catch(()=>{});},Math.min(delay,2_147_483_647));
    timer?.unref?.();
  }
  function failClosed(){
    blocked=true;ready=false;clearTimer();
    for(const controller of activeSignals)controller.abort();
  }
  async function stop() {
    if(stopFlight)return stopFlight;
    if(hardStopFlight)return hardStopFlight;
    if(active||pending||startFlight) return false;
    clearTimer();ready=false;
    stopFlight=(async()=>{
      try{
        await api.gracefulShutdown();
        if(await api.state()!=='stopped')throw new Error('PHALA_STOP_STATE_UNKNOWN');
        if(runningSince!==null){usedMs+=Math.max(0,now()-runningSince);runningSince=null}
        idleAt=null;
        return true;
      }catch{
        failClosed();
        throw new Error('PHALA_STOP_STATE_UNKNOWN');
      }finally{stopFlight=null}
    })();
    return stopFlight;
  }
  async function emergencyStop(){
    if(hardStopFlight)return hardStopFlight;
    failClosed();
    hardStopFlight=(async()=>{
      try{
        await api.forceStop();
        if(await api.state()!=='stopped')throw new Error('PHALA_STOP_STATE_UNKNOWN');
        if(runningSince!==null){usedMs+=Math.max(0,now()-runningSince);runningSince=null}
        idleAt=null;
        return true;
      }catch{throw new Error('PHALA_STOP_STATE_UNKNOWN')}
      finally{hardStopFlight=null}
    })();
    return hardStopFlight;
  }
  async function ensureReady(){
    if(closed||blocked)throw new Error('PHALA_WAKE_QUARANTINED');
    if(stopFlight)throw new Error('PHALA_CVM_STOPPING');
    if(exhausted())throw new Error('PHALA_RUNTIME_BUDGET_EXHAUSTED');
    if(ready)return true;
    if(startFlight)return startFlight;
    startFlight=(async()=>{
      // Include billable boot time. Preexisting running time is unknown and is
      // explicitly outside this process-local soft accounting window.
      runningSince??=now();
      armTimer();
      try{
        await api.ensureRunning();
        if(blocked)throw new Error('PHALA_WAKE_QUARANTINED');
        if(await api.state()!=='running'||await guestReady()!==true)
          throw new Error('PHALA_GUEST_NOT_READY');
        if(blocked)throw new Error('PHALA_WAKE_QUARANTINED');
        generation++;
        ready=true;
        armTimer();
        return true;
      }catch(error){
        ready=false;
        if(blocked){
          // A late start result after the deadline could undo the first stop.
          // Reconcile again after this start call has settled.
          try{
            if(hardStopFlight)await hardStopFlight;
            await api.forceStop();
            if(await api.state()!=='stopped')throw new Error('PHALA_STOP_STATE_UNKNOWN');
            if(runningSince!==null){usedMs+=Math.max(0,now()-runningSince);runningSince=null}
          }catch{throw new Error('PHALA_STOP_STATE_UNKNOWN')}
          throw error;
        }
        try{
          await api.gracefulShutdown();
          usedMs+=Math.max(0,now()-runningSince);runningSince=null;
        }catch{failClosed();throw new Error('PHALA_STOP_STATE_UNKNOWN')}
        throw error;
      }finally{startFlight=null}
    })();
    return startFlight;
  }
  async function run(jobId,fn=dispatch){
    if(typeof jobId!=='string'||!JOB.test(jobId)||typeof fn!=='function')throw new Error('PHALA_JOB_INVALID');
    if(closed||blocked)throw new Error('PHALA_WAKE_QUARANTINED');
    if(stopFlight)throw new Error('PHALA_CVM_STOPPING');
    if(jobs.has(jobId))return jobs.get(jobId);
    pending++;idleAt=null;armTimer();
    const promise=(async()=>{
      try{
        await ensureReady();
        if(closed||blocked||stopFlight||exhausted())throw new Error('PHALA_RUNTIME_BUDGET_EXHAUSTED');
        // Reconcile an out-of-band stop once, under the same start flight.
        // Never restart under an active dispatch; its trust context was lost.
        let state;
        try{state=await api.state()}catch{
          await emergencyStop().catch(()=>{});throw new Error('PHALA_CVM_STATE_UNKNOWN');
        }
        if(state==='stopped'&&active===0){
          ready=false;await ensureReady();
          try{state=await api.state()}catch{
            await emergencyStop().catch(()=>{});throw new Error('PHALA_CVM_STATE_UNKNOWN');
          }
        }
        if(state!=='running'){
          await emergencyStop().catch(()=>{});throw new Error('PHALA_CVM_STATE_UNKNOWN');
        }
        // A provider running state does not prove the app or its attestation.
        let healthy=false;
        try{healthy=await guestReady()===true}catch{healthy=false}
        if(!healthy){await emergencyStop().catch(()=>{});throw new Error('PHALA_GUEST_NOT_READY')}
        let attested=false;
        try{attested=await verifyAttestation({jobId,generation})===true}catch{attested=false}
        if(!attested){await emergencyStop().catch(()=>{});throw new Error('PHALA_ATTESTATION_UNAVAILABLE')}
        if(closed||blocked||stopFlight||exhausted())throw new Error('PHALA_CVM_UNAVAILABLE');
        const controller=new AbortController();
        activeSignals.add(controller);active++;
        try{
          const result=await fn(jobId,controller.signal);
          if(blocked||controller.signal.aborted)throw new Error('PHALA_CVM_UNAVAILABLE');
          return result;
        }finally{active--;activeSignals.delete(controller)}
      }finally{
        pending--;
        if(pending===0&&active===0)idleAt=now();
        if((blocked||closed)&&pending===0&&active===0&&runningSince!==null)
          void stop().catch(()=>{});
        else armTimer();
      }
    })();
    jobs.set(jobId,promise);
    try{return await promise}finally{jobs.delete(jobId)}
  }
  async function tick(){
    if(hardStopFlight)return hardStopFlight;
    if(runningSince!==null&&exhausted())return emergencyStop();
    if(closed||blocked||!ready||stopFlight||startFlight)return false;
    if(pending||active){armTimer();return false}
    if(!exhausted()&&(idleAt===null||now()-idleAt<idleMs)){armTimer();return false}
    return stop();
  }
  async function recoverUnknownStop(){
    if(!blocked||active||pending||startFlight||stopFlight||hardStopFlight)return false;
    let state;
    try{state=await api.state()}catch{return false}
    if(state==='running'||state==='stopping'){
      try{await api.forceStop();state=await api.state()}catch{return false}
    }
    if(state!=='stopped')return false;
    if(runningSince!==null){usedMs+=Math.max(0,now()-runningSince);runningSince=null}
    ready=false;blocked=false;idleAt=null;
    return true;
  }
  async function close(){
    closed=true;clearTimer();
    for(const controller of activeSignals)controller.abort();
    if(runningSince!==null||ready||startFlight||stopFlight||hardStopFlight)
      return emergencyStop();
    return true;
  }
  return Object.freeze({ensureReady,run,peekReady:()=>ready&&!blocked&&!closed&&!stopFlight&&!exhausted(),
    tick,recoverUnknownStop,close,snapshot:()=>Object.freeze({ready,blocked,closed,pending,active,
      generation,usedMs:spent(),deadlineReached:exhausted(),stopping:Boolean(stopFlight||hardStopFlight)})});
}
