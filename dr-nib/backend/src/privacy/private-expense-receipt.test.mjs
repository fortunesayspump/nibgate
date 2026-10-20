import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateExpenseReceipt} from './private-expense-receipt.js';
const call=(id,cost=37)=>({id,model:'typesafe/jev-1.13',status:'accounted',billingKind:'customer',costBasis:'provider-reported',committedMicroUsd:BigInt(cost),usageEvidence:{format:'drnib-private-usage-v1',costMicroUsd:cost,inputTokens:10,outputTokens:2,providerRequestId:'fixture-1',secret:'MUST_NOT_EXPORT'}});
test('confirmed paid delivery failure records actual sponsored provider cost without charging escrow',()=>{
 const tool={id:'lost',tool:'unlock_content',status:'complete',committedMicroUsd:0n,costBasis:'gateway-confirmed',resultDigest:'a'.repeat(64),txHash:'0x'+'b'.repeat(64),paymentEvidence:{billingKind:'platform',amount:'200000',providerCostMicroUsd:'200000',nonce:'MUST_NOT_EXPORT'}};
 const receipt=buildPrivateExpenseReceipt({runId:'fixture',calls:[],toolCalls:[tool],entries:[{kind:'deposit',amount:'0.25'}]});
 assert.equal(receipt.lines[0].status,'sponsored');assert.equal(receipt.lines[0].usageUsd,'0.200000');assert.equal(receipt.lines[0].chargedUsd,'0.000000');assert.equal(receipt.totals.balanceUsd,'0.250000');assert(!JSON.stringify(receipt).includes('MUST_NOT_EXPORT'));
 assert.throws(()=>buildPrivateExpenseReceipt({runId:'fixture',calls:[],toolCalls:[tool],entries:[{kind:'deposit',amount:'0.25'},{kind:'spend',amount:'0.2',txRef:'private-tool:lost'}]}),/PRIVATE_RECEIPT_INVALID/);
});
test('receipt reconciles exact deposit, calls, included share and confirmed refund',()=>{
 const receipt=buildPrivateExpenseReceipt({runId:'fixture',calls:[call('a'),call('b',4)],entries:[{kind:'deposit',amount:'0.25'},{kind:'spend',amount:'0.000037',txRef:'private-ai:a'},{kind:'spend',amount:'0.000004',txRef:'private-ai:b'},{kind:'fee',amount:'0.00000041'},{kind:'refund',amount:'0.249959'}],closed:true,settled:true});
 assert.equal(receipt.totals.chargedUsd,'0.000041');assert.equal(receipt.totals.balanceUsd,'0.000000');assert.equal(receipt.totals.includedPlatformShareUsd,'0.00000041');assert.equal(receipt.totals.unitemizedChargedUsd,'0.000000');
 assert.equal(receipt.lines[0].inputTokens,10);assert.equal(receipt.lines[0].status,'charged');assert.equal(receipt.infrastructure.chargedUsd,'0.000000');assert.equal(receipt.infrastructure.allocation,'not-metered');assert.ok(!JSON.stringify(receipt).includes('MUST_NOT_EXPORT'));
});
test('sponsored usage, unknown holds and late finalized usage cannot become retroactive customer charges',()=>{
 const calls=[{...call('sponsor'),billingKind:'sponsored'},{...call('unknown'),status:'reserved',costBasis:'legacy-ceiling'},call('late')];
 const pending=buildPrivateExpenseReceipt({runId:'fixture',calls,entries:[]});
 assert.deepEqual(pending.lines.map(l=>l.status),['sponsored','unresolved','pending']);assert.equal(pending.lines[1].usageUsd,null);
 const closed=buildPrivateExpenseReceipt({runId:'fixture',calls,entries:[],closed:true,settled:true});
 assert.deepEqual(closed.lines.map(l=>l.status),['sponsored','platform-covered','platform-covered']);assert.ok(closed.lines.every(l=>l.chargedUsd==='0.000000'));
});
test('invalid billed evidence fails closed and old unitemized ledger spend remains explicit',()=>{
 const receipt=buildPrivateExpenseReceipt({runId:'fixture',calls:[],entries:[{kind:'deposit',amount:1},{kind:'spend',amount:'0.1',txRef:'historical'}]});assert.equal(receipt.totals.unitemizedChargedUsd,'0.100000');
 assert.throws(()=>buildPrivateExpenseReceipt({runId:'fixture',calls:[call('a')],entries:[{kind:'deposit',amount:1},{kind:'spend',amount:'0.1',txRef:'private-ai:a'}]}),/PRIVATE_RECEIPT_INVALID/);
 assert.throws(()=>buildPrivateExpenseReceipt({runId:'fixture',calls:[],entries:[{kind:'refund',amount:1}]}),/PRIVATE_RECEIPT_INVALID/);
});
