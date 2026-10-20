import {deriveResultKey,bytesToBase64,openToolResult} from './dr-nib-private-crypto';
import {privateProjectSecrets,getPrivateManifest} from './dr-nib-private-records';
import {validatePrivateExternalRequest} from '@nibgate/internal/private-tools.js';

/** Reconcile only an already-dispatched Circle transfer. The callback is bound
 * to its original tool ID; this never creates or approves another purchase. */
export async function waitForPrivateToolSettlement(result:any,check:()=>Promise<any>,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){
 for(let checks=0;result?.status==='reserved'&&result.settlementPending===true&&checks<30;checks++){
  await wait(10000);
  result=await check();
 }
 return result;
}

/** Called by the owner's approve button, or for a byte-exact zero-cost public
 * query already approved during setup. The public recipient
 * key permits durable encrypted delivery; its secret seed never leaves client
 * or approved worker storage. No wallet/project key enters the money service. */
export async function approvePrivateExternalTool(runId:string,question:any,request:(path:string,method?:string,body?:unknown)=>Promise<any>){
 const value=validatePrivateExternalRequest(question.externalRequest);
 if(!/^[0-9a-f]{64}$/.test(question.id??''))throw Error('Invalid tool approval');
 const manifest=await getPrivateManifest(runId);
 if(manifest.value.status!=='awaiting'||manifest.value.pendingQuestion?.id!==question.id)throw Error('This public request is no longer current. Refresh before approving.');
 const {tenantId,secrets}=await privateProjectSecrets(runId),key=await deriveResultKey(secrets.reportKeySeed);
 const hex=question.id.slice(0,32),id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
 const approval=await request(`/v1/private/runs/${runId}/tools`,'POST',{id,manifestRevision:manifest.revision,questionId:question.id,request:value,recipientPublicKey:bytesToBase64(key.publicKey)});
 const execute=()=>request(`/v1/private/runs/${runId}/tools/${approval.id}/execute`,'POST');
 const result=await waitForPrivateToolSettlement(approval.status==='complete'?approval:await execute(),execute);
 if(result.status!=='complete'||!result.envelope)throw Error(result.settlementPending?'Circle is settling this payment. Its budget remains reserved. Try approving this same request again later to check settlement; it will not buy again.':result.status==='reserved'?'The tool has an uncertain payment outcome. No duplicate purchase was started. You may end this run to settle finalized expenses.':'The public tool did not complete. Your research remains parked; you can decline this request.');
 const output=await openToolResult(key.privateKey,result.envelope,{tenantId,runId,objectId:result.id,recipientId:key.recipientId});
 return {toolCallId:result.id,toolResult:output,questionId:question.id};
}
