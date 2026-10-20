/**
 * Small, deliberately non-HTTP Phala Cloud lifecycle port. The caller creates
 * an official @phala/cloud client and owns credential retrieval. No credentials,
 * request headers, or provider responses are ever logged here.
 *
 * https://docs.phala.com/phala-cloud/references/cloud-js-sdk/cvm-lifecycle
 * https://docs.phala.com/phala-cloud/references/cloud-js-sdk/cvm-query
 * https://docs.phala.com/phala-cloud/references/cloud-js-sdk/watch-cvm-state
 */
export function createPhalaLifecycleApi({client, cvmId, watchTimeoutSeconds=120, maxRetries=2, conflictWaitMs=30000, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  if (!client || ['getCvmState','startCvm','shutdownCvm','stopCvm','watchCvmState'].some(name=>typeof client[name]!=='function') ||
      typeof cvmId!=='string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(cvmId) ||
      !Number.isInteger(watchTimeoutSeconds) || watchTimeoutSeconds<10 || watchTimeoutSeconds>600 ||
      !Number.isInteger(maxRetries) || maxRetries<0 || maxRetries>10 || !Number.isSafeInteger(conflictWaitMs)||conflictWaitMs<1||conflictWaitMs>120000||typeof pause!=='function') throw new Error('PHALA_LIFECYCLE_CONFIG_INVALID');
  const id=cvmId;
  async function state() {
    const result=await client.getCvmState({id});
    const status=result?.status?.toLowerCase();
    if (!['running','stopped','starting','stopping'].includes(status)) throw new Error('PHALA_CVM_STATE_UNKNOWN');
    return status;
  }
  async function waitFor(target, signal) {
    const result=await client.watchCvmState({id,target,timeout:watchTimeoutSeconds,maxRetries,signal});
    if (result?.status?.toLowerCase()!==target) throw new Error('PHALA_CVM_TARGET_NOT_REACHED');
    // A separate immediate read guards against accepting only a stale stream event.
    if (await state()!==target) throw new Error('PHALA_CVM_TARGET_NOT_REACHED');
    return true;
  }
  async function ensureRunning(signal) {
    let current=await state();const deadline=Date.now()+conflictWaitMs;
    while(current==='stopped'){
      signal?.throwIfAborted();
      try{await client.startCvm({id});break;}
      catch(error){
        // Only a positively rejected conflict is safe to retry. A transport
        // failure may hide an accepted start and must be reconciled by caller.
        if(error?.status!==409||Date.now()>=deadline)throw error;
        await pause(1000);current=await state();
      }
    }
    if (!['running','starting','stopped'].includes(current))throw new Error('PHALA_CVM_STATE_UNKNOWN');
    if (current!=='running') await waitFor('running',signal);
    return true;
  }
  async function gracefulShutdown(signal) {
    const current=await state();
    if (current==='stopped') return true;
    if (current==='running') await client.shutdownCvm({id});
    else if (current!=='stopping') throw new Error('PHALA_CVM_STATE_UNKNOWN');
    await waitFor('stopped',signal);
    return true;
  }
  async function forceStop(signal) {
    // A failed state read must not prevent the emergency stop request.
    let current;
    try{current=await state()}catch{current='unknown'}
    if(current==='stopped')return true;
    await client.stopCvm({id});
    await waitFor('stopped',signal);
    return true;
  }
  return Object.freeze({state,ensureRunning,gracefulShutdown,forceStop});
}

// The installed SDK's rich state decoder rejects nullable progress metadata
// returned by the live API, and its standalone SSE helper omits some auth
// options. Use official SDK transport for the documented lifecycle endpoints,
// read only the status we need, and independently poll/confirm it. No VM state
// response or progress text is accepted as attestation or key-release evidence.
export function adaptOfficialPhalaLifecycleClient(client){
  if(typeof client?.get!=='function'||typeof client?.post!=='function')throw Error('PHALA_LIFECYCLE_CONFIG_INVALID');
  const path=id=>{if(!/^[A-Za-z0-9:_-]{1,128}$/.test(id||''))throw Error('PHALA_LIFECYCLE_CONFIG_INVALID');return '/cvms/'+encodeURIComponent(id);};
  const state=async({id})=>{const result=await client.get(path(id)+'/state');if(typeof result?.status!=='string')throw Error('PHALA_CVM_STATE_UNKNOWN');return {status:result.status};};
  return {
    getCvmState:state,
    startCvm:({id})=>client.post(path(id)+'/start'),
    shutdownCvm:({id})=>client.post(path(id)+'/shutdown'),
    stopCvm:({id})=>client.post(path(id)+'/stop'),
    async watchCvmState({id,target,timeout=120,signal}){
      const deadline=Date.now()+timeout*1000;
      while(Date.now()<deadline){
        signal?.throwIfAborted();const value=await state({id});if(value.status.toLowerCase()===target)return value;
        await new Promise((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,1000);const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('PHALA_WATCH_ABORTED'));};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
      }
      throw Error('PHALA_CVM_TARGET_NOT_REACHED');
    }
  };
}
export async function createOfficialPhalaLifecycleClient(options){
  const {createClient}=await import('@phala/cloud');
  return adaptOfficialPhalaLifecycleClient(createClient(options));
}
