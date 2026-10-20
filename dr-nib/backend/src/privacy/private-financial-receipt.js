import {Prisma} from '@prisma/client';
import {isConfidentialRun} from './guard.js';
import {buildPrivateExpenseReceipt} from './private-expense-receipt.js';

// Read money metadata from the authoritative ledger, never from model output
// or browser arguments. No chain signing key or public network call is needed.
export async function readPrivateFinancialReceipt(db,runId,tenantId){
 return db.$transaction(async tx=>{
  const run=await tx.researchRun.findUnique({where:{id:runId},select:{userId:true,metadata:true,deletedAt:true}});
  if(!run||run.userId!==tenantId||run.deletedAt||!isConfidentialRun(run))throw Error('PRIVATE_RECORD_NOT_FOUND');
  const entries=await tx.budgetLedger.findMany({where:{runId},select:{kind:true,amount:true,txRef:true}});
  const calls=await tx.privateInferenceCall.findMany({where:{runId},select:{id:true,model:true,billingKind:true,status:true,costBasis:true,usageEvidence:true,committedMicroUsd:true}});
  const toolCalls=await tx.privateToolCall.findMany({where:{runId},select:{id:true,tool:true,status:true,committedMicroUsd:true,costBasis:true,resultDigest:true,txHash:true}});
  const billing=await tx.$queryRaw`SELECT "id", "billingEvidence" FROM "PrivateToolBillingMetadata" WHERE "runId"=${runId}`;
  const evidence=new Map(billing.map(row=>[row.id,row.billingEvidence]));
  for(const call of toolCalls)call.paymentEvidence=evidence.get(call.id)??null;
  const total=kind=>entries.filter(e=>e.kind===kind).reduce((n,e)=>n.plus(e.amount),new Prisma.Decimal(0));
  const deposited=total('deposit'),spend=total('spend'),refunded=total('refund'),fee=total('fee');
  const local=run.metadata?.privateEscrow;
  return {expenseReceipt:buildPrivateExpenseReceipt({runId,entries,calls,toolCalls,closed:!!local?.settlement,settled:local?.splitConfirmed===true,escrow:local}),ledger:{deposited:deposited.toNumber(),spend:spend.toNumber(),refunded:refunded.toNumber(),fee:fee.toNumber(),balance:deposited.minus(spend).minus(refunded).toNumber()},
   escrow:local?{jobId:local.jobId,status:local.status,completeTx:local.completeTx??null,splitTx:local.splitTx??null,splitConfirmed:local.splitConfirmed===true}:null};
 },{isolationLevel:'RepeatableRead',timeout:60000,maxWait:10000});
}
