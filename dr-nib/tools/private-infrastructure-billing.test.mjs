import test from'node:test';import assert from'node:assert/strict';
import{infrastructureBillingWindow,reconcileInfrastructureBilling}from'./private-infrastructure-billing.mjs';
const row=(type,cost,end,event='hourly.billing')=>({instance_id:'fixture',usage_type:type,cost,billing_end:end,event_type:event});
const response={total:2,total_cost:'1.016270',usage:[row('compute','0.919435','2026-10-19 20:49:27','shutdown.billing'),row('disk','0.096835','2026-10-19 21:00:00')]};
const input={response,instanceId:'fixture',cvmState:'stopped',lastGuardAt:'2026-10-19T20:49:23Z',carriedMicroUsd:1417879,nowMs:Date.parse('2026-10-19T21:00:00Z')};
test('billing queries include the current day and use UTC regardless of local timezone',()=>{
 assert.equal(infrastructureBillingWindow(Date.parse('2026-10-19T23:30:00Z')).endDate,'2026-10-20T00:00:00.000Z');
});
test('full provider shutdown coverage replaces only the covered conservative reservation',()=>{
 const actual=reconcileInfrastructureBilling(input);assert.equal(actual.publishedMicroUsd,1016270);assert.equal(actual.planningBoundMicroUsd,1016270);assert.equal(actual.releasedReservation,true);
 const later=reconcileInfrastructureBilling({...input,nowMs:input.nowMs+3600000});assert.equal(later.planningBoundMicroUsd,1019050);
});
test('running machines or incomplete shutdown coverage retain their conservative reservation',()=>{
 for(const override of [{cvmState:'running'},{lastGuardAt:'2026-10-19T20:50:00Z'}]){
  const out=reconcileInfrastructureBilling({...input,...override});assert.equal(out.releasedReservation,false);assert.equal(out.planningBoundMicroUsd,1417879);
 }
});
test('pagination, mismatched instance, bad decimals and inconsistent totals cannot release a reservation',()=>{
 for(const patch of [{total:3},{total_cost:'1.00'},{usage:[{...response.usage[0],instance_id:'other'},response.usage[1]]},{usage:[{...response.usage[0],cost:'-1'},response.usage[1]]}])assert.throws(()=>reconcileInfrastructureBilling({...input,response:{...response,...patch}}),/PRIVATE_INFRA_BILLING_INVALID/);
});
test('numeric aggregate float noise is accepted only when it matches exact six-decimal provider rows',()=>{
 assert.equal(reconcileInfrastructureBilling({...input,response:{...response,total_cost:1.0162700000000002}}).publishedMicroUsd,1016270);
 for(const total_cost of [1.0162701,1.016271,NaN,-1,'1.0162700000000002'])assert.throws(()=>reconcileInfrastructureBilling({...input,response:{...response,total_cost}}),/INVALID/);
});
test('a post-stop guard tick can reconcile only with same-window stop confirmation and provider coverage',()=>{
 const after={...input,lastGuardAt:'2026-10-19T20:50:15Z',stoppedObservation:{instanceId:'fixture',state:'stopped',requestedAt:'2026-10-19T20:49:20Z',observedAt:'2026-10-19T20:49:40Z'}};
 assert.equal(reconcileInfrastructureBilling(after).releasedReservation,true);
 for(const patch of [{requestedAt:'2026-10-19T20:49:30Z'},{observedAt:'2026-10-19T20:49:25Z'},{requestedAt:'2026-10-19T20:45:00Z'}])assert.equal(reconcileInfrastructureBilling({...after,stoppedObservation:{...after.stoppedObservation,...patch}}).releasedReservation,false);
 assert.equal(reconcileInfrastructureBilling({...after,cvmState:'running'}).releasedReservation,false);
 assert.throws(()=>reconcileInfrastructureBilling({...after,stoppedObservation:{...after.stoppedObservation,instanceId:'other'}}),/INVALID/);
 const laterCompute={total:3,total_cost:'1.026270',usage:[...response.usage,row('compute','0.010000','2026-10-19 20:49:50')]};
 assert.equal(reconcileInfrastructureBilling({...after,response:laterCompute}).releasedReservation,false);
});
