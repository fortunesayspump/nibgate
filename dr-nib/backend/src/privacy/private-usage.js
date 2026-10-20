// Accounting amounts, never prompts, receipts, identifiers or provider errors.
// Unknown commitments remain reserved; this does not reconcile provider bills.
export function summarizePrivateUsage(rows) {
 const usage={format:'drnib-private-usage-summary-v2',verifiedMicroUsd:0,reportedMicroUsd:0,estimatedMicroUsd:0,reservedMicroUsd:0,calls:0};
 for(const row of rows){
  const amount=BigInt(row._sum.committedMicroUsd??0),calls=row._count._all;
  if(amount<0n||amount>BigInt(Number.MAX_SAFE_INTEGER)||!Number.isSafeInteger(calls)||calls<0)throw Error('PRIVATE_WORKFLOW_USAGE_INVALID');
  const key=row.status==='verified'?(row.costBasis==='receipt-reported'?'verifiedMicroUsd':'estimatedMicroUsd'):row.status==='accounted'?(row.costBasis==='provider-reported'?'reportedMicroUsd':'estimatedMicroUsd'):'reservedMicroUsd';
  usage[key]+=Number(amount);usage.calls+=calls;
 }
 usage.totalMicroUsd=usage.verifiedMicroUsd+usage.reportedMicroUsd+usage.estimatedMicroUsd+usage.reservedMicroUsd;
 if(!Number.isSafeInteger(usage.totalMicroUsd)||!Number.isSafeInteger(usage.calls))throw Error('PRIVATE_WORKFLOW_USAGE_INVALID');
 return usage;
}
export async function readPrivateUsage(db,runId){
 const query={where:{runId},_sum:{committedMicroUsd:true},_count:{_all:true}};
 const [current,legacy]=await Promise.all([db.privateInferenceCall.groupBy({...query,by:['status','costBasis']}),db.privateAiBudgetReservation.groupBy({...query,by:['status']})]);
 return summarizePrivateUsage([...current,...legacy]);
}
/** Only explicitly priced, provenance-tagged usage may become a customer debit. */
export function isFinalizedPrivateCharge(call){
 const cost=BigInt(call.committedMicroUsd),e=call.usageEvidence;
 if(call.status==='not-dispatched')return call.costBasis==='not-dispatched'&&cost===0n;
 if(cost<0n||cost>BigInt(Number.MAX_SAFE_INTEGER)||!e||e.format!=='drnib-private-usage-v1'||e.costMicroUsd!==Number(cost)||
    !Number.isSafeInteger(e.inputTokens)||e.inputTokens<0||!Number.isSafeInteger(e.outputTokens)||e.outputTokens<0)return false;
 if(call.status==='verified')return call.costBasis==='receipt-reported'&&/^[0-9a-f]{64}$/.test(e.requestDigest??'')&&/^[0-9a-f]{64}$/.test(e.responseDigest??'');
 return call.status==='accounted'&&call.costBasis==='provider-reported'&&/^[A-Za-z0-9_:.-]{1,200}$/.test(e.providerRequestId??'');
}
