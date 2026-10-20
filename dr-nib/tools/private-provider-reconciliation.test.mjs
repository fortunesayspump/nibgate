import test from 'node:test';import assert from 'node:assert/strict';
import {providerZeroChargeUpdate} from './private-provider-reconciliation.mjs';
const call={id:'call',runId:'run',model:'fixture/model',status:'reserved',costBasis:'reservation',committedMicroUsd:27593n,usageEvidence:{failure:{httpStatus:429,receiptId:'receipt',requestDigest:'a'.repeat(64)}}};
const evidence={format:'drnib-provider-zero-charge-v1',callId:'call',runId:'run',model:'fixture/model',receiptId:'receipt',requestDigest:'a'.repeat(64),reviewedEvidenceSha256:'b'.repeat(64),ticketUrl:'https://cloud.phala.com/nibgate/support/1207',reviewedAt:'2026-10-20T17:20:00Z',confirmedBilledMicroUsd:0,finalOutcome:'failed'};
test('exact reviewed provider failure clears only its commitment and preserves forwarding evidence',()=>{
 const update=providerZeroChargeUpdate(call,evidence);assert.equal(update.committedMicroUsd,0n);assert.equal(update.status,'reconciled');assert.deepEqual(update.usageEvidence.failure,call.usageEvidence.failure);assert.equal(call.committedMicroUsd,27593n);
});
test('missing records, wrong receipt/request, positive cost and nonfinal outcomes cannot release holds',()=>{
 for(const patch of [{receiptId:'other'},{requestDigest:'c'.repeat(64)},{callId:'other'},{runId:'other'},{model:'other'},{confirmedBilledMicroUsd:1},{finalOutcome:'unknown'},{reviewedEvidenceSha256:''},{ticketUrl:'https://example.com/support'}])assert.throws(()=>providerZeroChargeUpdate(call,{...evidence,...patch}));
 for(const patch of [{status:'verified'},{usageEvidence:null},{usageEvidence:{failure:{...call.usageEvidence.failure,httpStatus:503}}}])assert.throws(()=>providerZeroChargeUpdate({...call,...patch},evidence));
});
