// Owner-workstation accounting repair only. A manually reviewed provider
// statement is provenance, not an inference receipt or a non-dispatch proof.
export function providerZeroChargeUpdate(call,evidence){
 const fail=()=>{throw Error('PRIVATE_PROVIDER_RECONCILIATION_INVALID')};
 const f=call?.usageEvidence?.failure;
 if(call?.status!=='reserved'||call.costBasis!=='reservation'||!f||f.httpStatus!==429||
    evidence?.format!=='drnib-provider-zero-charge-v1'||evidence.finalOutcome!=='failed'||evidence.confirmedBilledMicroUsd!==0||
    evidence.callId!==call.id||evidence.runId!==call.runId||evidence.model!==call.model||
    evidence.receiptId!==f.receiptId||evidence.requestDigest!==f.requestDigest||
    !/^[0-9a-f]{64}$/.test(evidence.requestDigest??'')||
    !/^[0-9a-f]{64}$/.test(evidence.reviewedEvidenceSha256??'')||
    !/^https:\/\/cloud\.phala\.com\/nibgate\/support\/\d+$/.test(evidence.ticketUrl??'')||
    !Number.isFinite(Date.parse(evidence.reviewedAt??'')))fail();
 return {status:'reconciled',costBasis:'provider-confirmed-no-charge',committedMicroUsd:0n,
  usageEvidence:{...call.usageEvidence,reconciliation:structuredClone(evidence)}};
}
