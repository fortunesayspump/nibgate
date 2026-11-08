import{test}from'node:test';import assert from'node:assert/strict';
import{reconcileMonthlyBudget,monthlyRemaining,reserveMonthlyStart,validateMonthlyPolicy}from'./phala-monthly-budget.js';
const policy={capMicroUsd:2000000,hourlyMicroUsd:58000,stopReserveMs:300000};
const jan=Date.UTC(2026,0,31,23,59),feb=Date.UTC(2026,1,1);
const state=()=>({usedMs:7200000,startedAt:null,runtimeAllowanceGrants:[{id:'prior-manual-grant'}]});
test('migration charges prior usage without resetting cumulative counters or grant history',()=>{
 const s=state();reconcileMonthlyBudget(s,jan,policy);assert.equal(s.usedMs,7200000);assert.equal(s.monthlyCompute.months['2026-01'],7200000);assert.equal(s.runtimeAllowanceGrants[0].id,'prior-manual-grant');
 assert.equal(monthlyRemaining(s,jan),Math.floor(2000000*3600000/58000)-300000-7200000);
});
test('running usage is split exactly across monthly boundary and survives controller reads',()=>{
 const s=state();reconcileMonthlyBudget(s,jan,policy);reserveMonthlyStart(s,jan);s.startedAt=jan;
 reconcileMonthlyBudget(s,feb+30000,policy);assert.equal(s.monthlyCompute.months['2026-01'],7320000);assert.equal(s.monthlyCompute.months['2026-02'],30000);
 reconcileMonthlyBudget(s,feb+30000,policy);assert.equal(s.monthlyCompute.months['2026-02'],30000);
});
test('stopped months renew automatically without charging idle time or discarding old audit',()=>{
 const s=state();reconcileMonthlyBudget(s,jan,policy);reconcileMonthlyBudget(s,feb,policy);assert.equal(s.monthlyCompute.months['2026-02'],0);assert.equal(s.monthlyCompute.months['2026-01'],7200000);
});
test('each start reserves a full billed minute; exhaustion stays exhausted after reconstruction',()=>{
 const s=state();reconcileMonthlyBudget(s,jan,policy);const before=monthlyRemaining(s,jan);reserveMonthlyStart(s,jan);assert.equal(monthlyRemaining(s,jan),before-60000);
 s.monthlyCompute.months['2026-01']=200000000;reconcileMonthlyBudget(s,jan,policy);assert.equal(monthlyRemaining(s,jan),0);
});
test('clock rollback and changed monthly policy fail closed',()=>{
 const s=state();reconcileMonthlyBudget(s,jan,policy);assert.throws(()=>reconcileMonthlyBudget(s,jan-1,policy),/CLOCK/);
 assert.throws(()=>reconcileMonthlyBudget(s,jan,{...policy,capMicroUsd:3000000}),/MISMATCH/);
});
test('monthly configuration cannot exceed owner-approved cap or omit stop reserve',()=>{
 assert.deepEqual(validateMonthlyPolicy(policy),policy);
 for(const p of [{...policy,capMicroUsd:2500000},{...policy,stopReserveMs:0},{...policy,hourlyMicroUsd:0},{...policy,extra:true}])assert.throws(()=>validateMonthlyPolicy(p),/INVALID/);
});
test('migration reconstructs manual runtime credits rather than forgetting already billed use',()=>{
 const s=state();s.runtimeAllowanceGrants=[{additionalRuntimeMs:1800000},{additionalRuntimeMs:1805000}];reconcileMonthlyBudget(s,jan,policy);assert.equal(s.monthlyCompute.months['2026-01'],10805000);
});
test('corrupt persisted budget cannot turn remaining allowance into NaN or bypass stop',()=>{
 const s=state();reconcileMonthlyBudget(s,jan,policy);s.monthlyCompute.months['2026-01']='invalid';assert.throws(()=>reconcileMonthlyBudget(s,jan,policy),/STATE_INVALID/);
});
test('Postgres JSONB key reordering does not fence an identical monthly policy',()=>{
 const s=state();reconcileMonthlyBudget(s,jan,policy);s.monthlyCompute.policy={stopReserveMs:300000,hourlyMicroUsd:58000,capMicroUsd:2000000};assert.doesNotThrow(()=>reconcileMonthlyBudget(s,jan,policy));
});
