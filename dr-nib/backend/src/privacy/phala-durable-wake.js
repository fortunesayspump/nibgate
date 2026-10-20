import{randomUUID}from'node:crypto';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** Shared durable intents fence assignment across broker replicas. A timed-out
 * provider operation stays quarantined until its bounded call window has elapsed
 * and stop has been independently confirmed. No content or keys enter this store. */
export function createDurablePhalaWake({store,api,guestReady,verifyAttestation,idleMs=300000,maxRuntimeMs,
  startupMs=240000,operationMs=240000,leaseMs=30000,maxPending=64,maxActive=4,pollMs=250,tickMs=5000,
  wait=sleep,now=()=>Date.now(),onEvent=()=>{}}={}){
  if(!store?.mutate||!api||!['state','ensureRunning','gracefulShutdown','forceStop'].every(k=>typeof api[k]==='function')||
    typeof guestReady!=='function'||typeof verifyAttestation!=='function'||
    ![idleMs,maxRuntimeMs,startupMs,operationMs,leaseMs,maxPending,maxActive,pollMs,tickMs].every(Number.isSafeInteger)||
    idleMs<0||maxRuntimeMs<1||startupMs<1||operationMs<startupMs||leaseMs<100||maxPending<1||maxPending>256||maxActive<1||maxActive>32||pollMs<1||tickMs<1)throw Error('PHALA_DURABLE_WAKE_CONFIG_INVALID');
  const initial={version:1,phase:'stopped',tenant:null,policy:{idleMs,maxRuntimeMs,startupMs,operationMs,leaseMs,maxPending,maxActive},generation:0,usedMs:0,startedAt:null,lastActivity:0,operation:null,holds:{}};
  let timer,closed=false,ticking=false;
  const active=new Map();let wakeFlight=null;
  function event(type,details={}){try{onEvent({type,at:now(),...details})}catch{}}
  const mutate=fn=>store.mutate(initial,(s,t,busy)=>{
    if(s.version!==1||!s.policy||Object.keys(s.policy).sort().join(',')!==Object.keys(initial.policy).sort().join(',')||Object.entries(initial.policy).some(([k,v])=>s.policy[k]!==v))throw Error('PHALA_LIFECYCLE_POLICY_MISMATCH');
    for(const [id,h]of Object.entries(s.holds))if(h.until<=t)delete s.holds[id];
    return fn(s,t,busy);
  });
  const spent=(s,t)=>s.usedMs+(s.startedAt===null?0:Math.max(0,t-s.startedAt));
  function stopped(s,t){s.usedMs=spent(s,t);s.startedAt=null;s.phase='stopped';s.operation=null;s.lastActivity=t;}
  async function finish(token,phase,error){return mutate((s,t)=>{
    if(s.operation?.token!==token)return false;
    if(error){s.phase='quarantined';return false;}
    if(phase==='stopped')stopped(s,t);else{s.phase=phase;s.operation=null;s.lastActivity=t;}
    return true;
  });}
  async function start(token){
    const begin=now();event('start-requested');
    try{
      await api.ensureRunning(AbortSignal.timeout(startupMs));
      event('provider-running',{elapsedMs:now()-begin});
      while(await guestReady()!==true){if(now()-begin>=startupMs)throw Error('PHALA_GUEST_NOT_READY');await wait(Math.min(pollMs,1000));}
      if(!await finish(token,'ready'))throw Error('PHALA_LIFECYCLE_FENCED');
      event('app-ready',{elapsedMs:now()-begin});
    }catch(error){await finish(token,'quarantined',true).catch(()=>{});throw error;}
  }
  async function ensure(){
    const deadline=now()+startupMs+operationMs;
    while(!closed){
      const choice=await mutate((s,t)=>{
        if(spent(s,t)>=maxRuntimeMs)throw Error('PHALA_RUNTIME_BUDGET_EXHAUSTED');
        if(s.phase==='ready')return {ready:true,generation:s.generation};
        if(s.phase==='stopped'){
          if(maxRuntimeMs-spent(s,t)<operationMs)throw Error('PHALA_RUNTIME_BUDGET_EXHAUSTED');
          const token=randomUUID();s.phase='starting';s.startedAt=t;s.generation++;s.operation={token,until:t+operationMs};return {token};
        }
        if(s.operation&&s.operation.until<=t){s.phase='quarantined';}
        return {waiting:s.phase};
      });
      if(choice.ready)return choice.generation;
      if(choice.token){await start(choice.token);continue;}
      if(now()>=deadline)throw Error('PHALA_WAKE_PENDING');
      await tick();await wait(pollMs);
    }
    throw Error('PHALA_WAKE_CLOSED');
  }
  async function run(jobId,fn){
    if(closed||typeof jobId!=='string'||jobId.length>180||typeof fn!=='function')throw Error('PHALA_JOB_INVALID');
    const id=randomUUID(),abort=new AbortController();let heartbeat,renewing=false;
    await mutate((s,t)=>{
      if(Object.keys(s.holds).length>=maxPending)throw Error('PHALA_WAKE_CAPACITY');
      if(['draining','quarantined'].includes(s.phase))throw Error('PHALA_CVM_STOPPING');
      s.holds[id]={until:t+leaseMs};s.lastActivity=t;
    });
    active.set(id,abort);
    heartbeat=setInterval(()=>{
      if(renewing)return;renewing=true;
      void mutate((s,t)=>{if(!s.holds[id]||['quarantined','draining'].includes(s.phase))throw Error('PHALA_LIFECYCLE_FENCED');s.holds[id].until=t+leaseMs;})
        .catch(()=>abort.abort()).finally(()=>renewing=false);
    },Math.max(25,Math.floor(leaseMs/3)));heartbeat.unref?.();
    try{
      const generation=await ensure();const slotDeadline=now()+maxRuntimeMs;
      while(!await mutate((s,t,busy)=>{
        if(s.phase!=='ready'||s.generation!==generation||!s.holds[id]||spent(s,t)>=maxRuntimeMs)throw Error('PHALA_LIFECYCLE_FENCED');
        if(Object.values(s.holds).filter(h=>h.active).length+Number(busy)>=maxActive)return false;
        s.holds[id].active=true;return true;
      })){
        if(abort.signal.aborted||now()>=slotDeadline)throw Error('PHALA_WAKE_CAPACITY');await wait(pollMs);
      }
      if(abort.signal.aborted)throw Error('PHALA_LIFECYCLE_FENCED');
      try{
        if(await api.state()!=='running'||await guestReady()!==true)throw Error('PHALA_GUEST_NOT_READY');
        if(await verifyAttestation({jobId,generation})!==true)throw Error('PHALA_ATTESTATION_UNAVAILABLE');
      }catch(error){await mutate((s,t)=>{if(s.phase==='ready'){s.phase='quarantined';s.operation={token:randomUUID(),until:t};}});throw error;}
      await mutate((s,t)=>{if(s.phase!=='ready'||s.generation!==generation||!s.holds[id]||spent(s,t)>=maxRuntimeMs)throw Error('PHALA_LIFECYCLE_FENCED');});
      if(abort.signal.aborted)throw Error('PHALA_LIFECYCLE_FENCED');
      event('attestation-ready');const out=await fn(jobId,abort.signal);
      if(abort.signal.aborted)throw Error('PHALA_LIFECYCLE_FENCED');return out;
    }finally{
      clearInterval(heartbeat);active.delete(id);
      await mutate((s,t)=>{delete s.holds[id];s.lastActivity=t;}).catch(()=>{});
    }
  }
  async function tick(){
    if(ticking||closed)return false;ticking=true;
    try{
      let claim=await mutate((s,t,busy)=>{
        if(s.phase==='stopped')return {probeStopped:true};
        const hard=spent(s,t)>=maxRuntimeMs;
        if(s.operation&&s.operation.until>t)return null;
        const uncertain=['quarantined','starting','draining'].includes(s.phase);
        if(!hard&&!uncertain&&(Object.keys(s.holds).length||busy)){s.lastActivity=t;return null;}
        if(!hard&&!uncertain&&t-s.lastActivity<idleMs)return null;
        const token=randomUUID();s.phase='draining';s.operation={token,until:t+operationMs};return {token,force:hard||uncertain};
      });
      if(claim?.probeStopped){
        const actual=await api.state();
        if(actual==='stopped')return false;
        claim=await mutate((s,t)=>{
          if(s.phase!=='stopped'||Object.keys(s.holds).length)return null;
          const token=randomUUID();s.phase='draining';s.startedAt=t;s.operation={token,until:t+operationMs};return {token,force:true};
        });
      }
      if(!claim)return false;
      event('stop-requested',{forced:claim.force});
      if(claim.force)for(const abort of active.values())abort.abort();
      try{
        if(claim.force)await api.forceStop(AbortSignal.timeout(operationMs));
        else{
          try{await api.gracefulShutdown(AbortSignal.timeout(operationMs));}
          catch{event('graceful-stop-fallback');await api.forceStop(AbortSignal.timeout(operationMs));}
        }
        if(await api.state()!=='stopped')throw Error('PHALA_STOP_STATE_UNKNOWN');
        if(!await finish(claim.token,'stopped'))throw Error('PHALA_LIFECYCLE_FENCED');
        event('provider-stopped');return true;
      }catch(error){await finish(claim.token,'quarantined',true).catch(()=>{});throw error;}
    }finally{ticking=false;}
  }
  return Object.freeze({run,
    async requestWake(runId){
      if(!/^[0-9a-f-]{36}$/i.test(runId||''))throw Error('PHALA_JOB_INVALID');
      const s=await mutate(s=>({phase:s.phase}));
      if(s.phase==='stopped'&&!wakeFlight){wakeFlight=run(`${runId}:${randomUUID()}`,async()=>true);void wakeFlight.catch(()=>event('wake-failed')).finally(()=>{wakeFlight=null});}
      return {phase:s.phase==='stopped'?'starting':s.phase,enabled:true};
    },
    async status(){return mutate(s=>({phase:s.phase,enabled:true}));},
    ensureReady:jobId=>run(jobId,async()=>true),tick,
    snapshot:()=>mutate((s,t,busy)=>({...s,holds:Object.keys(s.holds).length,backgroundBusy:busy,usedMs:spent(s,t)})),
    start(){if(!timer){timer=setInterval(()=>void tick().catch(()=>event('lifecycle-reconcile-required')),tickMs);timer.unref?.();}return this;},
    async close(){closed=true;clearInterval(timer);for(const abort of active.values())abort.abort();}
  });
}
