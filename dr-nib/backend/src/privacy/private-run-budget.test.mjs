import test from 'node:test';
import assert from 'node:assert/strict';
import {admitPrivateRunSpend,privateBudgetMicroUsd} from './private-run-budget.js';
test('run admission counts verified, reported and uncertain commitments plus the legacy path',async()=>{
 const seen=[];
 const tx={researchRun:{findUnique:async()=>({metadata:{}})},privateToolCall:{aggregate:async query=>{seen.push(query);return {_sum:{committedMicroUsd:0n}}}},privateInferenceCall:{aggregate:async query=>{seen.push(query);return {_sum:{committedMicroUsd:70n}}}},privateAiBudgetReservation:{aggregate:async query=>{seen.push(query);return {_sum:{committedMicroUsd:10n}}}}};
 await admitPrivateRunSpend(tx,'owned-run',20n,100);
 await assert.rejects(admitPrivateRunSpend(tx,'owned-run',21n,100),{message:'PRIVATE_RUN_BUDGET_EXHAUSTED'});
 assert.ok(seen.every(q=>q.where.runId==='owned-run'&&!Object.hasOwn(q.where,'status')));
 for(const cap of [-1,NaN,'100',0.1,1000000001])await assert.rejects(admitPrivateRunSpend(tx,'owned-run',1n,cap));
 assert.equal(privateBudgetMicroUsd(0.05),50000);
 assert.equal(privateBudgetMicroUsd(0),0);
 assert.equal(privateBudgetMicroUsd(undefined),undefined);
 for(const cap of [null,-1,NaN,Infinity,'0.05',1001])assert.throws(()=>privateBudgetMicroUsd(cap));
});
