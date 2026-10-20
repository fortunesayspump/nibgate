import test from 'node:test';import assert from 'node:assert/strict';
import {summarizePrivateUsage,isFinalizedPrivateCharge} from './private-usage.js';
test('priced usage, historical estimates and uncertain reservations stay separate',()=>{
 const row=(status,amount,calls,costBasis)=>({status,costBasis,_sum:{committedMicroUsd:BigInt(amount)},_count:{_all:calls}});
 assert.deepEqual(summarizePrivateUsage([row('verified',100,2,'receipt-reported'),row('accounted',302,7,'provider-reported'),row('verified',106107,52,'legacy-ceiling'),row('reserved',404337,11)]),{format:'drnib-private-usage-summary-v2',verifiedMicroUsd:100,reportedMicroUsd:302,estimatedMicroUsd:106107,reservedMicroUsd:404337,totalMicroUsd:510846,calls:72});
 assert.equal(summarizePrivateUsage([row('unexpected',123,1)]).reservedMicroUsd,123);
 assert.equal(summarizePrivateUsage([row('accounted',123,1)]).estimatedMicroUsd,123);
 assert.throws(()=>summarizePrivateUsage([row('verified',-1,1)]));
 assert.throws(()=>summarizePrivateUsage([row('verified',Number.MAX_SAFE_INTEGER,1),row('accounted',1,1)]));
});
test('only finalized priced evidence or proven zero dispatch can settle a customer charge',()=>{
 const evidence={format:'drnib-private-usage-v1',inputTokens:100,outputTokens:10,costMicroUsd:1,requestDigest:'a'.repeat(64),responseDigest:'b'.repeat(64)};
 const receipt={status:'verified',costBasis:'receipt-reported',committedMicroUsd:1n,usageEvidence:evidence};
 assert.equal(isFinalizedPrivateCharge(receipt),true);
 for(const patch of [{status:'reserved'},{costBasis:'legacy-ceiling'},{usageEvidence:null},{committedMicroUsd:2n},{usageEvidence:{...evidence,responseDigest:'invalid'}},{usageEvidence:{...evidence,inputTokens:-1}}])assert.equal(isFinalizedPrivateCharge({...receipt,...patch}),false);
 const reported={status:'accounted',costBasis:'provider-reported',committedMicroUsd:1n,usageEvidence:{...evidence,providerRequestId:'gen-synthetic'}};
 assert.equal(isFinalizedPrivateCharge(reported),true);
 assert.equal(isFinalizedPrivateCharge({...reported,usageEvidence:{...evidence,providerRequestId:'invalid id'}}),false);
 assert.equal(isFinalizedPrivateCharge({status:'not-dispatched',costBasis:'not-dispatched',committedMicroUsd:0n}),true);
 assert.equal(isFinalizedPrivateCharge({status:'not-dispatched',costBasis:'not-dispatched',committedMicroUsd:1n}),false);
});
