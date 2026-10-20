import {createHash} from 'node:crypto';
import {canonicalToolJson,validatePrivateExternalRequest} from '@nibgate/internal/private-tools.js';
const digest=value=>createHash('sha256').update(canonicalToolJson(value)).digest('hex');
export function isFinalizedPrivateToolCharge(row){
 const cost=BigInt(row.committedMicroUsd);
 if(row.status==='failed')return cost===0n&&['not-dispatched','gateway-failed'].includes(row.costBasis);
 return row.status==='complete'&&cost>=0n&&cost<=2000000n&&/^[0-9a-f]{64}$/.test(row.resultDigest??'')&&
  (row.costBasis==='no-charge'&&cost===0n||['seller-receipt','chain-receipt','gateway-confirmed'].includes(row.costBasis)&&/^0x[0-9a-f]{64}$/i.test(row.txHash??''));
}
/** Financial proof is read from the authoritative money table, never trusted
 * from model output or the owner's submitted cost/response fields. */
export async function readPrivateExternalResult(db,runId,{request,answer}){
 const expected=validatePrivateExternalRequest(request);
 const row=await db.privateToolCall.findFirst({where:{id:answer.toolCallId,runId},select:{id:true,runId:true,questionId:true,tool:true,requestDigest:true,status:true,committedMicroUsd:true,costBasis:true,resultDigest:true,txHash:true}});
 if(!row||row.status!=='complete'||!isFinalizedPrivateToolCharge(row)||row.questionId!==answer.questionId||row.requestDigest!==digest(expected)||row.resultDigest!==digest(answer.toolResult))throw Error('PRIVATE_TOOL_RECEIPT_INVALID');
 return {ok:true,callId:row.id,costMicroUsd:Number(row.committedMicroUsd),output:answer.toolResult};
}
