import {guestPlanningPolicy} from './guest-planning-policy.js';
import {isConfidentialRun} from './guard.js';
// A run cap is supplied only by decrypted guest state, never broker metadata.
// Both inference paths call this under the shared admission transaction lock.
export function privateBudgetMicroUsd(value) {
    if (value === undefined) return undefined; // platform-funded intake
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000)
        throw Error('PRIVATE_RUN_BUDGET_INVALID');
    return Math.floor(value * 1000000);
}
export async function availablePrivateRunSpend(tx, runId, budgetMicroUsd, fundingRequired=false, billingKind='owner-test',ownedRun) {
    const run=ownedRun??await tx.researchRun.findUnique({where:{id:runId}});
    if(run?.metadata?.privateCancellation)throw Error('PRIVATE_RUN_BUDGET_CLOSED');
    const guest = guestPlanningPolicy(run);
    if (guest) {
        // Guest sponsorship is finite, including reservations with unknown outcomes.
        const spent = await tx.privateInferenceCall.aggregate({where:{runId},_sum:{committedMicroUsd:true}});
        const available = BigInt(guest.maxCostMicroUsd) - BigInt(spent._sum.committedMicroUsd ?? 0);
        return available > 0n ? available : 0n;
    }
    if(billingKind==='platform')return null; // still subject to the shared monthly gate
    if(run?.settledAt||run?.metadata?.privateEscrow?.settlement)throw Error('PRIVATE_RUN_BUDGET_CLOSED');
    let funded;
    if(fundingRequired){
        const deposit=await tx.budgetLedger.aggregate({where:{runId,kind:'deposit'},_sum:{amount:true}});
        funded=Math.floor(Number(deposit._sum.amount??0)*1000000);
        if(!run?.metadata?.privateEscrow?.jobId||!Number.isSafeInteger(funded)||funded<1)throw Error('PRIVATE_RUN_FUNDING_REQUIRED');
    }
    if (budgetMicroUsd === undefined && !fundingRequired) return null;
    if(budgetMicroUsd===undefined)budgetMicroUsd=funded;
    if (!Number.isSafeInteger(budgetMicroUsd) || budgetMicroUsd < 0 || budgetMicroUsd > 1000000000)
        throw Error('PRIVATE_RUN_BUDGET_INVALID');
    const current = await tx.privateInferenceCall.aggregate({where:{runId,...(fundingRequired?{billingKind:'customer'}:{})},_sum:{committedMicroUsd:true}});
    const legacy = await tx.privateAiBudgetReservation.aggregate({where:{runId},_sum:{committedMicroUsd:true}});
    const tools=await tx.privateToolCall.aggregate({where:{runId},_sum:{committedMicroUsd:true}});
    const available=BigInt(fundingRequired?Math.min(funded,budgetMicroUsd):budgetMicroUsd)-BigInt(current._sum.committedMicroUsd??0)-BigInt(legacy._sum.committedMicroUsd??0)-BigInt(tools._sum.committedMicroUsd??0);
    return available>0n?available:0n;
}
export async function admitPrivateRunSpend(tx,runId,reserved,budgetMicroUsd,fundingRequired=false,billingKind='owner-test',ownedRun){
    const available=await availablePrivateRunSpend(tx,runId,budgetMicroUsd,fundingRequired,billingKind,ownedRun);
    if(available!==null&&reserved>available)throw Error('PRIVATE_RUN_BUDGET_EXHAUSTED');
}

/** Guest-readable money metadata only; no signing keys or public API calls. */
export async function readPrivateTipBudget(db,runId,tenantId){
 return db.$transaction(async tx=>{
  const run=await tx.researchRun.findUnique({where:{id:runId},select:{userId:true,deletedAt:true,settledAt:true,metadata:true}});
  if(!run||!isConfidentialRun(run)||run.userId!==tenantId||run.deletedAt||run.settledAt||run.metadata?.privateCancellation||run.metadata?.privateEscrow?.settlement)throw Error('PRIVATE_RUN_BUDGET_CLOSED');
  const deposits=await tx.budgetLedger.aggregate({where:{runId,kind:'deposit'},_sum:{amount:true}});
  const ai=await tx.privateInferenceCall.aggregate({where:{runId,billingKind:'customer'},_sum:{committedMicroUsd:true}});
  const legacy=await tx.privateAiBudgetReservation.aggregate({where:{runId},_sum:{committedMicroUsd:true}});
  const tools=await tx.privateToolCall.aggregate({where:{runId},_sum:{committedMicroUsd:true}});
  const tips=await tx.privateToolCall.aggregate({where:{runId,tool:'tip_creator'},_sum:{committedMicroUsd:true}});
  return {tippedMicroUsd:Number(tips._sum.committedMicroUsd??0),fundedMicroUsd:Math.floor(Number(deposits._sum.amount??0)*1000000),committedMicroUsd:Number(BigInt(ai._sum.committedMicroUsd??0)+BigInt(legacy._sum.committedMicroUsd??0)+BigInt(tools._sum.committedMicroUsd??0))};
 },{isolationLevel:'RepeatableRead',timeout:60000,maxWait:10000});
}
