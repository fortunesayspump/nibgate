/**
 * Small, deliberately non-HTTP Phala Cloud lifecycle port. The caller creates
 * an official @phala/cloud client and owns credential retrieval. No credentials,
 * request headers, or provider responses are ever logged here.
 *
 * https://docs.phala.com/phala-cloud/references/cloud-js-sdk/cvm-lifecycle
 * https://docs.phala.com/phala-cloud/references/cloud-js-sdk/cvm-query
 * https://docs.phala.com/phala-cloud/references/cloud-js-sdk/watch-cvm-state
 */
export function createPhalaLifecycleApi({client, cvmId, watchTimeoutSeconds=120, maxRetries=2}={}) {
  if (!client || ['getCvmState','startCvm','shutdownCvm','stopCvm','watchCvmState'].some(name=>typeof client[name]!=='function') ||
      typeof cvmId!=='string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(cvmId) ||
      !Number.isInteger(watchTimeoutSeconds) || watchTimeoutSeconds<10 || watchTimeoutSeconds>600 ||
      !Number.isInteger(maxRetries) || maxRetries<0 || maxRetries>10) throw new Error('PHALA_LIFECYCLE_CONFIG_INVALID');
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
    const current=await state();
    if (current==='stopped') await client.startCvm({id});
    else if (current!=='running' && current!=='starting') throw new Error('PHALA_CVM_STATE_UNKNOWN');
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
