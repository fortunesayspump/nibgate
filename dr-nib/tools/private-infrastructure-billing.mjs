const MICRO=1000000n;
const invalid=()=>Error('PRIVATE_INFRA_BILLING_INVALID');
function micros(value){
 // The API sums exact six-decimal rows into a JSON number; e.g. a total can
 // arrive as 1.3319670000000001. Tolerate only binary floating-point noise,
 // never a genuinely sub-micro amount, then compare against the exact row sum.
 if(typeof value==='number'){
  const scaled=value*1000000,rounded=Math.round(scaled);
  if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(rounded)||Math.abs(scaled-rounded)>Math.min(0.000001,Number.EPSILON*Math.max(1,Math.abs(scaled))*4))throw invalid();
  return BigInt(rounded);
 }
 const match=/^(\d+)(?:\.(\d{1,6}))?$/.exec(String(value));if(!match)throw invalid();
 return BigInt(match[1])*MICRO+BigInt((match[2]??'').padEnd(6,'0'));
}
function time(value){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z)?$/.test(value))throw invalid();
 const ms=Date.parse(value.replace(' ','T').replace(/Z?$/,'Z'));if(!Number.isFinite(ms))throw invalid();return ms;
}
/** Explicit tomorrow UTC avoids the API's implicit midnight end date. */
export function infrastructureBillingWindow(nowMs=Date.now()){
 const now=new Date(nowMs);if(!Number.isFinite(now.getTime()))throw invalid();
 return {startDate:'2026-10-18T00:00:00Z',endDate:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString()};
}
/** Only complete provider records covering a known stopped interval can release
 * its old conservative reservation. Running, partial or unconfirmed data cannot. */
export function reconcileInfrastructureBilling({response,instanceId,cvmState,lastGuardAt,carriedMicroUsd,stoppedObservation,nowMs=Date.now(),diskMicroUsdPerHour=2780}){
 const rows=response?.usage;if(!Array.isArray(rows)||!rows.length||response.total!==rows.length||!Number.isSafeInteger(carriedMicroUsd)||carriedMicroUsd<0||!Number.isSafeInteger(diskMicroUsdPerHour)||diskMicroUsdPerHour<0||!Number.isFinite(nowMs))throw invalid();
 if(rows.some(r=>r.instance_id!==instanceId||!['compute','disk'].includes(r.usage_type)))throw invalid();
 const published=rows.reduce((n,r)=>n+micros(r.cost),0n);
 const total=micros(response.total_cost);if(total!==published)throw invalid();
 const guardAt=time(lastGuardAt),ends=rows.map(r=>time(r.billing_end));
 const computeStop=rows.filter(r=>r.usage_type==='compute'&&r.event_type==='shutdown.billing').reduce((n,r)=>Math.max(n,time(r.billing_end)),0);
 const diskThrough=rows.filter(r=>r.usage_type==='disk').reduce((n,r)=>Math.max(n,time(r.billing_end)),0);
 if(Math.max(...ends)>nowMs+60000)throw invalid();
 // A local guard may keep ticking after an independently confirmed manual
 // stop. Its bookkeeping timestamp is then later than the actual billable
 // interval. Accept only a matching, closely bounded stop observation from
 // that same guard window, covered by complete provider shutdown records.
 let observedStop=false;
 if(stoppedObservation!==undefined){
  const o=stoppedObservation;
  if(o?.instanceId!==instanceId||o?.state!=='stopped')throw invalid();
  const requested=time(o.requestedAt),observed=time(o.observedAt);
  if(requested>observed||observed>nowMs)throw invalid();
  observedStop=requested<=computeStop&&computeStop<=observed&&observed<=guardAt&&guardAt-requested<=120000&&
   rows.filter(r=>r.usage_type==='compute').every(r=>time(r.billing_end)<=computeStop);
 }
 const covered=cvmState==='stopped'&&(computeStop>=guardAt||observedStop)&&diskThrough>=computeStop;
 const idleMs=Math.max(0,nowMs-diskThrough),idle=BigInt(Math.ceil(idleMs*diskMicroUsdPerHour/3600000));
 const bound=covered?published+idle:BigInt(carriedMicroUsd)>published+idle?BigInt(carriedMicroUsd):published+idle;
 if(bound>BigInt(Number.MAX_SAFE_INTEGER))throw invalid();
 return {format:'drnib-infrastructure-reconciliation-v1',publishedMicroUsd:Number(published),unbilledDiskBoundMicroUsd:Number(idle),planningBoundMicroUsd:Number(bound),releasedReservation:covered,providerComputeStoppedAt:new Date(computeStop).toISOString(),diskBilledThrough:new Date(diskThrough).toISOString(),checkedAt:new Date(nowMs).toISOString(),notice:'Provider billing is distinct from a planning bound; this does not guarantee a future stop deadline.'};
}
