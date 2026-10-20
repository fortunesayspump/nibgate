import {Prisma} from '@prisma/client';
import {isFinalizedPrivateCharge} from './private-usage.js';
import {isFinalizedPrivateToolCharge} from './private-external-receipt.js';

// Financial metadata only. Prompts, outputs and provider error bodies must
// never enter the money service or a downloadable expense receipt.
export function buildPrivateExpenseReceipt({runId,entries,calls,toolCalls=[],closed=false,settled=false,escrow=null}){
 const zero=()=>new Prisma.Decimal(0);
 const amount=v=>{const n=new Prisma.Decimal(v);if(!n.isFinite()||n.isNegative())throw Error('PRIVATE_RECEIPT_INVALID');return n;};
 const total=kind=>entries.filter(e=>e.kind===kind).reduce((n,e)=>n.plus(amount(e.amount)),zero());
 const spendByCall=new Map();
 for(const entry of entries.filter(e=>e.kind==='spend')){
  if(typeof entry.txRef!=='string'||!entry.txRef.startsWith('private-ai:'))continue;
  const id=entry.txRef.slice(11);spendByCall.set(id,(spendByCall.get(id)??zero()).plus(amount(entry.amount)));
 }
 const lines=calls.map(call=>{
  const finalized=isFinalizedPrivateCharge(call),charged=spendByCall.get(call.id)??zero();
  const usage=finalized?new Prisma.Decimal(call.committedMicroUsd.toString()).div(1000000):null;
  const debited=spendByCall.has(call.id);
  if(debited&&(!finalized||call.billingKind!=='customer'||!charged.eq(usage)))throw Error('PRIVATE_RECEIPT_INVALID');
  const status=call.billingKind!=='customer'?'sponsored':debited?'charged':call.status==='not-dispatched'?'not-dispatched':closed?'platform-covered':finalized?'pending':'unresolved';
  return {id:call.id,category:'ai',model:call.model,status,costBasis:call.costBasis,
   chargedUsd:charged.toFixed(6),usageUsd:usage?.toFixed(6)??null,
   ...(finalized&&call.usageEvidence?{inputTokens:call.usageEvidence.inputTokens,outputTokens:call.usageEvidence.outputTokens}:{})};
 });
 for(const call of toolCalls){
  const charges=entries.filter(e=>e.kind==='spend'&&e.txRef==='private-tool:'+call.id),charged=charges.reduce((n,e)=>n.plus(amount(e.amount)),zero());
  const finalized=isFinalizedPrivateToolCharge(call),sponsored=finalized&&call.committedMicroUsd===0n&&call.paymentEvidence?.billingKind==='platform';
  const provider=sponsored?String(call.paymentEvidence.providerCostMicroUsd??''):null;
  if(sponsored&&(!/^\d{1,16}$/.test(provider)||BigInt(provider)>2000000n||provider!==call.paymentEvidence.amount))throw Error('PRIVATE_RECEIPT_INVALID');
  const usage=finalized?new Prisma.Decimal(sponsored?provider:call.committedMicroUsd.toString()).div(1000000):null;
  if(charges.length&&(!finalized||sponsored||!charged.eq(usage)))throw Error('PRIVATE_RECEIPT_INVALID');
  lines.push({id:call.id,category:'tool',model:call.tool,status:sponsored?'sponsored':charges.length?'charged':call.status==='approved'?'not-started':call.status==='failed'?'not-dispatched':closed?'platform-covered':finalized?'pending':'unresolved',costBasis:call.costBasis,chargedUsd:charged.toFixed(6),usageUsd:usage?.toFixed(6)??null});
 }
 const deposited=total('deposit'),charged=total('spend'),refund=total('refund');
 const itemized=lines.reduce((n,line)=>n.plus(line.chargedUsd),zero());
 const balance=deposited.minus(charged).minus(refund);
 if(balance.isNegative()||total('fee').gt(charged))throw Error('PRIVATE_RECEIPT_INVALID');
 return {format:'drnib-expense-receipt-v1',receiptId:'drnib-expenses:'+runId,runId,currency:'USD',generatedAt:new Date().toISOString(),settlement:settled?'confirmed':'pending',lines,
  notice:'Owner-test expense receipt. Test escrow assets are not real USD payments. This is not a tax invoice.',
  proof:escrow?{jobId:escrow.jobId,completeTx:escrow.completeTx??null,splitTx:escrow.splitTx??null,splitConfirmed:escrow.splitConfirmed===true}:null,
  totals:{depositedUsd:deposited.toFixed(6),chargedUsd:charged.toFixed(6),refundedUsd:refund.toFixed(6),balanceUsd:balance.toFixed(6),includedPlatformShareUsd:total('fee').toFixed(8),unitemizedChargedUsd:charged.minus(itemized).toFixed(6)},
  infrastructure:{payer:'operator',chargedUsd:'0.000000',allocation:'not-metered',description:'Shared Phala compute and storage are operator-funded. No per-run infrastructure charge is applied.'},
  tools:{chargedUsd:lines.filter(l=>l.category==='tool').reduce((n,l)=>n.plus(l.chargedUsd),zero()).toFixed(6),description:'Only finalized, owner-approved public tool expenses are chargeable. Pending and uncertain attempts are not invoices; operator wallet gas is covered by the platform.'}};
}
