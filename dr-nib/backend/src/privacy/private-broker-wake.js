import {randomUUID} from 'node:crypto';

/** Hold a CVM job lease across capability signing and the entire guest request.
 * The opaque ID is unique per HTTP request: the durable execution journal, not
 * this process-local lease, decides whether a retried paid job may run again. */
export async function withPrivateBrokerWake(wakeController,forward,runId){
  if(typeof forward!=='function')throw new Error('PRIVATE_WAKE_CONFIG_INVALID');
  if(wakeController===undefined)return forward(undefined);
  if(typeof wakeController?.run!=='function')throw new Error('PRIVATE_WAKE_CONFIG_INVALID');
  if(typeof runId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId))
    throw new Error('PRIVATE_WAKE_CONFIG_INVALID');
  return wakeController.run(`${runId}:${randomUUID()}`,async(_jobId,signal)=>forward(signal));
}

export function wakeAwareGuestHealth(wakeController,probe){
  if(typeof probe!=='function'||wakeController!==undefined&&typeof wakeController?.ensureReady!=='function')
    throw new Error('PRIVATE_WAKE_CONFIG_INVALID');
  return async()=>{
    if(wakeController)await wakeController.ensureReady();
    return probe();
  };
}
