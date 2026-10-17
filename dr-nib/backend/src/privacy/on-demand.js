const JOB = /^[A-Za-z0-9:_-]{1,128}$/;
/**
 * Provider-neutral lifecycle policy for an already-provisioned CVM. The API
 * port and real attestation verifier are deliberately absent in production.
 * Jobs carry opaque IDs only; ciphertext is stored in the repository. The
 * runtime limit is an admission/idle ceiling, not a provider billing hard cap:
 * active work can overrun it. Production needs an external billing stop.
 */
export function createOnDemandController({api,verifyAttestation,dispatch,now=()=>Date.now(),idleMs,maxRuntimeMs}) {
  if (!api?.ensureRunning || !api?.waitReady || !api?.gracefulShutdown ||
      typeof verifyAttestation!=='function' || typeof dispatch!=='function' ||
      !Number.isSafeInteger(idleMs) || idleMs<0 || !Number.isSafeInteger(maxRuntimeMs) || maxRuntimeMs<=0)
    throw new Error('incomplete CVM lifecycle policy');
  let startPromise=null, runningSince=null, usedMs=0, active=0, pending=0, lastIdleAt=null, stopping=false, blocked=false;
  const jobs=new Map();
  const activeSignals=new Set();
  async function ensureReady() {
    if (blocked) throw new Error('CVM shutdown status unknown; manual recovery required');
    if (startPromise) return startPromise;
    const attempt=(async()=>{
      if (usedMs>=maxRuntimeMs) throw new Error('CVM runtime budget exhausted');
      runningSince ??= now(); // include billable startup in admission accounting
      await api.ensureRunning();
      const ready=await api.waitReady();
      if (ready!==true) throw new Error('CVM not ready');
      return true;
    })();
    startPromise=attempt.catch(async(error)=>{
      if (runningSince!==null) {
        try {
          await api.gracefulShutdown();
          usedMs+=Math.max(0,now()-runningSince);
          runningSince=null;startPromise=null;
        } catch {blocked=true;throw new Error('CVM shutdown status unknown; manual recovery required')}
      } else startPromise=null;
      throw error;
    });
    return startPromise;
  }
  async function submit(jobId) {
    if (typeof jobId!=='string' || !JOB.test(jobId)) throw new Error('invalid opaque job ID');
    if (jobs.has(jobId)) return jobs.get(jobId);
    if (stopping) throw new Error('CVM is stopping');
    pending++;
    lastIdleAt=null;
    const job=(async()=>{
      try {
        await ensureReady();
        if (blocked || stopping) throw new Error('CVM unavailable');
        if (usedMs+(now()-runningSince)>=maxRuntimeMs) throw new Error('CVM runtime budget exhausted');
        if (await verifyAttestation(jobId)!==true) {
          blocked=true;
          for(const controller of activeSignals)controller.abort(); // fail-stop trust loss
          try {await api.gracefulShutdown();usedMs+=Math.max(0,now()-runningSince);runningSince=null;startPromise=null} catch {}
          throw new Error('CVM attestation unavailable');
        }
        if (blocked || stopping || !startPromise) throw new Error('CVM unavailable');
        if (usedMs+(now()-runningSince)>=maxRuntimeMs) throw new Error('CVM runtime budget exhausted');
        const controller=new AbortController();
        activeSignals.add(controller);
        active++;
        try {const result=await dispatch(jobId,controller.signal);if(blocked||controller.signal.aborted)throw new Error('CVM unavailable');return result}
        finally {active--;activeSignals.delete(controller)}
      } finally {
        pending--;
        if (pending===0 && active===0) lastIdleAt=now();
      }
    })();
    jobs.set(jobId,job);
    try {return await job} catch(error) {jobs.delete(jobId);throw error}
  }
  async function tick() {
    if (stopping || !startPromise || pending>0 || active>0 || lastIdleAt===null) return false;
    if (now()-lastIdleAt<idleMs && usedMs+(now()-runningSince)<maxRuntimeMs) return false;
    stopping=true;
    try {
      await api.gracefulShutdown();
      usedMs+=Math.max(0,now()-runningSince);
      runningSince=null;startPromise=null;lastIdleAt=null;
      return true;
    } catch {blocked=true;throw new Error('CVM shutdown status unknown; manual recovery required')}
    finally {stopping=false}
  }
  return {submit,tick,snapshot:()=>({active,pending,running:Boolean(startPromise),usedMs:usedMs+(runningSince===null?0:Math.max(0,now()-runningSince))})};
}
