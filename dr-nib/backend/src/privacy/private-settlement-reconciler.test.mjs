import test from 'node:test';
import assert from 'node:assert/strict';
import {startPrivateSettlementReconciler} from './private-settlement-reconciler.js';

test('terminal settlement retries without a browser and isolates a failing job',async()=>{
 const attempts=[],errors=[];let scans=0,stop;
 const db={researchRun:{findMany:async query=>{
  assert.deepEqual(query.where,{userId:'owner',deletedAt:null,settledAt:null,OR:[{status:{in:['complete','ended','failed']}},{metadata:{path:['privateCancellation','reason'],equals:'owner-ended'}}],metadata:{path:['privateEscrow','jobId'],string_starts_with:''}});
  assert.deepEqual(Object.keys(query.select).sort(),['id','metadata','userId']);
  scans++;
  return [{id:'none',userId:'owner',metadata:{}},{id:'retry',userId:'owner',metadata:{privateEscrow:{jobId:'1'}}},{id:'ok',userId:'owner',metadata:{privateEscrow:{jobId:'2'}}}];
 }}};
 await new Promise((resolve,reject)=>{
  const deadline=setTimeout(()=>{stop();reject(Error('reconciliation timed out'));},1000);
  stop=startPrivateSettlementReconciler({db,tenantId:'owner',intervalMs:2,onError:code=>errors.push(code),funding:{settle:async(id,user)=>{
   assert.deepEqual(user,{id:'owner'});attempts.push(id);
   if(id==='retry'&&scans===1)throw Error('lost chain reply');
   if(id==='ok'&&scans===2){stop();clearTimeout(deadline);resolve();}
   return scans===1?{pending:true}:{alreadySettled:true};
  }}});
 });
 assert.deepEqual(attempts,['retry','ok','retry','ok']);
 assert.deepEqual(errors,['PRIVATE_SETTLEMENT_RETRY_PENDING']);
});
