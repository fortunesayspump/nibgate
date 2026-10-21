// Called only with the authenticated encrypted action failure and checkpoint,
// under the same admission lock as dispatch. Billing uncertainty is retained.
export function rejected429Recovery({checkpoint,failure,calls,requestId}){
 const entries=checkpoint?.entries,unfinished=entries?.filter(entry=>entry.state!=='complete');
 if(failure?.error!=='PHALA_PRIVATE_AI_RATE_LIMITED'||unfinished?.length!==1||unfinished[0]!==entries.at(-1)||unfinished[0].kind!=='infer'||unfinished[0].state!=='started'||!Array.isArray(calls)||calls.length!==1|| (checkpoint.reconciliations??[]).filter(r=>r.kind==='operator-covered-429').length>=2)return null;
 const call=calls[0],f=call.usageEvidence?.failure;
 if(call.status!=='reserved'||call.actionId!==requestId||f?.httpStatus!==429||f.model!==call.model||!/^sha256:[0-9a-f]{64}$/.test('sha256:'+f.requestDigest)||!/^rcpt-[a-zA-Z0-9-]+$/.test(f.receiptId??''))return null;
 return {callId:call.id,receiptId:f.receiptId,requestDigest:f.requestDigest,retainedMicroUsd:String(call.committedMicroUsd)};
}

// The admission lock and expired action lease are checked by the caller.
// A model completion cannot execute tools: only the fenced workflow can.
// Keep the entire unknown charge under the operator cap before admitting a
// bounded replacement; never claim that the missing response was free.
export function interruptedInferenceRecovery({checkpoint,calls,requestId,receiptStatus}){
 const entries=checkpoint?.entries,unfinished=entries?.filter(e=>e.state!=='complete');
 if(receiptStatus!=='processing'||unfinished?.length!==1||unfinished[0]!==entries.at(-1)||unfinished[0].kind!=='infer'||unfinished[0].state!=='started'||!Array.isArray(calls)||calls.length!==1||(checkpoint.reconciliations??[]).filter(r=>r.kind==='operator-covered-interrupted-inference').length>=2)return null;
 const call=calls[0];
 if(call.status!=='reserved'||call.actionId!==requestId||call.usageEvidence!=null||BigInt(call.committedMicroUsd)<=0n||BigInt(call.committedMicroUsd)!==BigInt(call.reservedMicroUsd))return null;
 return {callId:call.id,model:call.model,retainedMicroUsd:String(call.committedMicroUsd)};
}
